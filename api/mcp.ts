import type { VercelRequest, VercelResponse } from "@vercel/node";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

const BARK_KEY = process.env.BARK_KEY || "";

function createServer(): McpServer {
  const server = new McpServer({
    name: "bark-mcp-server",
    version: "1.0.0",
  });

  server.registerTool(
    "send_notification",
    {
      title: "Send Bark Push Notification",
      description:
        "Send a push notification to S's phone via Bark. The message appears on her lock screen.",
      inputSchema: {
        title: z.string().default("Sage").describe("Notification title"),
        body: z.string().min(1).describe("Message content"),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async ({ title, body }: { title: string; body: string }) => {
      if (!BARK_KEY) {
        return {
          content: [{ type: "text" as const, text: "Error: BARK_KEY not set." }],
        };
      }

      try {
        const res = await fetch(`https://api.day.app/${BARK_KEY}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body }),
        });

        if (!res.ok) {
          const text = await res.text();
          return {
            content: [{ type: "text" as const, text: `Bark error ${res.status}: ${text}` }],
          };
        }

        return {
          content: [{ type: "text" as const, text: `Sent: "${body}"` }],
        };
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        return {
          content: [{ type: "text" as const, text: `Failed: ${msg}` }],
        };
      }
    }
  );

  return server;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method === "GET") {
    res.json({ status: "ok", name: "bark-mcp-server" });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const server = createServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  res.on("close", () => transport.close());
  await server.connect(transport);
  await transport.handleRequest(req, res, req.body);
}
