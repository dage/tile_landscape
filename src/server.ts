import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { GoogleGenAI } from '@google/genai';
import type { Part } from '@google/genai';
import { z } from 'zod';
import fs from 'node:fs';
import chokidar from 'chokidar';

(async () => {
  // Wrap in async IIFE
  const GOOGLE_API_KEY = process.env.GOOGLE_API_KEY;
  if (!GOOGLE_API_KEY) {
    console.error(
      '[MCP Server] ERROR: GOOGLE_API_KEY environment variable is not set.'
    );
    process.exit(1);
  }

  const GEMINI_MODEL = process.env.GEMINI_MODEL ?? 'gemini-1.5-pro-vision';
  const ai = new GoogleGenAI({ apiKey: GOOGLE_API_KEY as string });

  async function analyse(
    file: string,
    prompt: string
  ): Promise<{ b64: string; answer: string }> {
    console.log(
      `[MCP Server] Analysing file: ${file} with prompt: "${prompt.substring(0, 50)}..."`
    );
    const b64 = fs.readFileSync(file, 'base64');

    const imagePart: Part = {
      inlineData: {
        data: b64,
        mimeType: 'image/png',
      },
    };
    const textPart: Part = { text: prompt };

    try {
      const result = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ role: 'user', parts: [imagePart, textPart] }],
      });
      const responseText = result.text;

      if (
        responseText &&
        result.candidates &&
        result.candidates.length > 0 &&
        result.candidates[0].content &&
        result.candidates[0].content.parts &&
        result.candidates[0].content.parts.length > 0
      ) {
        console.log(`[MCP Server] GenAI analysis successful for ${file}.`);
        return { b64, answer: responseText };
      } else {
        console.error(
          `[MCP Server] GenAI Error: No valid content in response for ${file}. Response:`,
          JSON.stringify(result, null, 2)
        );
        throw new Error('No valid content in GenAI response');
      }
    } catch (e) {
      console.error(`[MCP Server] GenAI Error during analysis of ${file}:`, e);
      throw new Error(`GenAI API Error: ${(e as Error).message}`);
    }
  }

  const server = new McpServer({
    name: "Tiny MCP 'Vision' Server",
    version: '0.1.0',
  });

  const AnalyseScreenshotParams = z.object({
    path: z.string(),
    question: z.string().default("What's wrong with this UI?"),
  });

  const WatchFolderParams = z.object({
    folder: z.string(),
    question: z.string().default('Spot issues in this screenshot'),
  });

  server.tool(
    'analyse_screenshot',
    AnalyseScreenshotParams.shape,
    async (params: z.infer<typeof AnalyseScreenshotParams>) => {
      const { path: filePath, question } = params;
      console.log(
        `[MCP Server] Received analyse_screenshot for path: ${filePath}, question: ${question}`
      );
      try {
        const { b64, answer } = await analyse(filePath, question);
        console.log(
          `[MCP Server] Analysis complete. Answer: ${answer.substring(0, 100)}...`
        );
        return {
          content: [
            { type: 'image', data: b64, mimeType: 'image/png' },
            { type: 'text', text: answer },
          ],
        };
      } catch (error) {
        console.error('[MCP Server] Error in analyse_screenshot:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error analyzing screenshot: ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );

  const watchers: Record<string, chokidar.FSWatcher> = {};
  server.tool(
    'watch_folder',
    WatchFolderParams.shape,
    async (params: z.infer<typeof WatchFolderParams>) => {
      const { folder, question } = params;
      console.log(
        `[MCP Server] Received watch_folder for folder: ${folder}, question: ${question}`
      );
      if (watchers[folder]) {
        console.log(`[MCP Server] Already watching folder: ${folder}`);
        return { content: [{ type: 'text', text: 'Already watching' }] };
      }
      try {
        const w = chokidar.watch(folder, { ignoreInitial: true });
        w.on('add', async (filePathAdded: string) => {
          console.log(
            `[MCP Server] File added to watched folder ${folder}: ${filePathAdded}`
          );
          if (!/.(png|jpe?g)$/i.test(filePathAdded)) {
            console.log(
              `[MCP Server] File ${filePathAdded} is not an image, skipping.`
            );
            return;
          }
          try {
            const { b64, answer } = await analyse(filePathAdded, question);
            console.log(
              `[MCP Server] Analysis complete for ${filePathAdded}. Answer: ${answer.substring(0, 100)}...`
            );
            // server.sendEvent({ // Commented out for now
            //   eventName: 'new_image_analysis',
            //   data: { path: filePathAdded, analysis: answer, image_b64: b64 },
            // });
          } catch (innerError) {
            console.error(
              `[MCP Server] Error analyzing file ${filePathAdded} in watched folder:`,
              innerError
            );
            // server.sendEvent({ // Commented out for now
            //   eventName: 'image_analysis_error',
            //   data: { path: filePathAdded, error: (innerError as Error).message },
            // });
          }
        });
        watchers[folder] = w;
        console.log(`[MCP Server] Now watching folder: ${folder}`);
        return { content: [{ type: 'text', text: `Watching ${folder}` }] };
      } catch (error) {
        console.error('[MCP Server] Error in watch_folder setup:', error);
        return {
          content: [
            {
              type: 'text',
              text: `Error setting up watcher for ${folder}: ${(error as Error).message}`,
            },
          ],
        };
      }
    }
  );

  console.log('[MCP Server] Starting Stdio server transport...');
  await server.connect(new StdioServerTransport());
  console.log('[MCP Server] Stdio server transport connected.');
})().catch((err) => {
  console.error('[MCP Server] Unhandled error during server startup:', err);
  process.exit(1);
});
