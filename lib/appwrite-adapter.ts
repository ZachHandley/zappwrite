import { App } from "astro/app";
import { applyPolyfills } from "astro/app/node";
import { Hono } from "hono";
import { join } from "node:path";
import fs from "node:fs/promises";
import { fileTypeFromFile } from "file-type";
import { SSRManifest } from "astro";
import { AppwriteRequest } from "./appwrite-request.js";
import { createFetchRequest } from "./request-transform.js";
import { createGetEnv } from "./env.js";
import { setGetEnv } from "astro/env/runtime";

// @ts-expect-error
import { handler, manifest } from "./server/entry.mjs";

applyPolyfills();

type AppwriteContext = {
  req: AppwriteRequest;
  res: {
    send: (
      body: any,
      statusCode?: number,
      headers?: Record<string, string>
    ) => { body: any; statusCode: number; headers: Record<string, string> };
    text: (
      body: string | Uint8Array | Response,
      statusCode?: number,
      headers?: Record<string, string>
    ) => {
      body: Uint8Array;
      statusCode: number;
      headers: Record<string, string>;
    };
    binary: (
      bytes: Uint8Array,
      statusCode?: number,
      headers?: Record<string, string>
    ) => {
      body: Uint8Array;
      statusCode: number;
      headers: Record<string, string>;
    };
    json: (
      obj: any,
      statusCode?: number,
      headers?: Record<string, string>
    ) => {
      body: Uint8Array;
      statusCode: number;
      headers: Record<string, string>;
    };
    empty: () => {
      body: Uint8Array;
      statusCode: number;
      headers: Record<string, string>;
    };
    redirect: (
      url: string,
      statusCode?: number,
      headers?: Record<string, string>
    ) => {
      body: Uint8Array;
      statusCode: number;
      headers: Record<string, string>;
    };
  };
  log: (message: string) => void;
  error: (message: string) => void;
};

async function findManifestFile(serverDir: string, context: AppwriteContext) {
  try {
    context.log(`Searching for manifest file in: ${serverDir}`);
    try {
      await fs.access(serverDir);
    } catch (error) {
      context.error(`Directory does not exist: ${serverDir}, error: ${error}`);
      return null;
    }

    const files = await fs.readdir(serverDir, { recursive: true });
    context.log(`Found files: ${JSON.stringify(files, null, 4)}`);
    const manifestFile = files.find(
      (file) => file.startsWith("manifest") && file.endsWith(".mjs")
    );
    context.log(`Found manifest file: ${manifestFile}`);
    return manifestFile || null;
  } catch (error) {
    context.error(`Error in findManifestFile: ${error}`);
    if (error instanceof Error) {
      context.error(`Error stack: ${error.stack}`);
    }
    return null;
  }
}

const MIME_TYPES = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
  ".json": "application/json",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
};

/**
 * CLOUDFLARE EXAMPLE FOR THEIR CREATE EXPORTS
 * export function createExports(manifest: SSRManifest) {
	const app = new App(manifest);

	const fetch = async (
		request: Request & CLOUDFLARE_REQUEST,
		env: Env,
		context: ExecutionContext
	) => {
		const { pathname } = new URL(request.url);

		// static assets fallback, in case default _routes.json is not used
		if (manifest.assets.has(pathname)) {
			return env.ASSETS.fetch(request.url.replace(/\.html$/, ''));
		}

		const routeData = app.match(request);
		if (!routeData) {
			// https://developers.cloudflare.com/pages/functions/api-reference/#envassetsfetch
			const asset = await env.ASSETS.fetch(
				request.url.replace(/index.html$/, '').replace(/\.html$/, '')
			);
			if (asset.status !== 404) {
				return asset;
			}
		}

		Reflect.set(
			request,
			Symbol.for('astro.clientAddress'),
			request.headers.get('cf-connecting-ip')
		);

		process.env.ASTRO_STUDIO_APP_TOKEN ??= (() => {
			if (typeof env.ASTRO_STUDIO_APP_TOKEN === 'string') {
				return env.ASTRO_STUDIO_APP_TOKEN;
			}
		})();

		const locals: Runtime = {
			runtime: {
				env: env,
				cf: request.cf,
				caches: caches as unknown as CLOUDFLARE_CACHESTORAGE,
				ctx: {
					waitUntil: (promise: Promise<any>) => context.waitUntil(promise),
					// Currently not available: https://developers.cloudflare.com/pages/platform/known-issues/#pages-functions
					passThroughOnException: () => {
						throw new Error(
							'`passThroughOnException` is currently not available in Cloudflare Pages. See https://developers.cloudflare.com/pages/platform/known-issues/#pages-functions.'
						);
					},
				},
			},
		};

		setGetEnv(createGetEnv(env));

		const response = await app.render(request, { routeData, locals });

		if (app.setCookieHeaders) {
			for (const setCookieHeader of app.setCookieHeaders(response)) {
				response.headers.append('Set-Cookie', setCookieHeader);
			}
		}

		return response;
	};

	return { default: { fetch } };
}
 */

export const createExports = async (manifest: SSRManifest) => {
  console.log(`[DEBUG] Starting createExports`);
  console.log(
    `[DEBUG] Manifest assets: ${JSON.stringify(
      Array.from(manifest.assets),
      null,
      2
    )}`
  );
  const app = new App(manifest);
  console.log(`[DEBUG] App created successfully`);

  const handler = async (
    req: AppwriteRequest | Request,
    context: AppwriteContext
  ) => {
    context.log(`\n[DEBUG] ====== New Request ======`);
    context.log(`[DEBUG] Request URL: ${req.url}`);
    context.log(`[DEBUG] Request method: ${req.method}`);
    context.log(
      `[DEBUG] Request headers: ${JSON.stringify(req.headers, null, 2)}`
    );

    if (!context) {
      console.log(`[DEBUG] Context is undefined`);
    }

    const url = new URL(req.url!);
    const pathname = url.pathname;
    context.log(`[DEBUG] Parsed pathname: ${pathname}`);

    // Check for static assets in manifest
    context.log(
      `[DEBUG] Checking manifest for: ${pathname} and ${pathname.slice(1)}`
    );
    if (
      manifest.assets.has(pathname) ||
      manifest.assets.has(pathname.slice(1))
    ) {
      context.log(`[DEBUG] Static asset match found in manifest`);
      try {
        const filePath = join("src/function/client", pathname);
        context.log(`[DEBUG] Attempting to read static file: ${filePath}`);
        const content = await fs.readFile(filePath, "utf-8");
        context.log(`[DEBUG] Successfully read static file`);
        return context.res.text(content, 200, {
          "Content-Type": "text/html",
          "Cache-Control": "public, max-age=3600",
        });
      } catch (error) {
        context.error(`[DEBUG] Static asset read failed: ${error}`);
        return context.res.text("Not Found", 404);
      }
    }

    // Set environment variables for Astro
    setGetEnv(createGetEnv(process.env));

    // Match route using app.match
    context.log(`[DEBUG] Creating Fetch API request for routing`);
    let finalRequest: Request;
    if (req instanceof AppwriteRequest) {
      finalRequest = createFetchRequest(req);
    } else {
      finalRequest = req;
    }

    const routeData = app.match(finalRequest);
    context.log(
      `[DEBUG] Route match result: ${routeData ? "Found" : "Not Found"}`
    );
    if (routeData) {
      context.log(`[DEBUG] Route data: ${JSON.stringify(routeData, null, 2)}`);
    }

    if (!routeData) {
      context.log(`[DEBUG] No route match, attempting to serve static file`);
      try {
        const filePath = join(
          "src/function/client",
          pathname === "/" ? "index.html" : pathname
        );
        context.log(`[DEBUG] Attempting to read: ${filePath}`);
        const content = await fs.readFile(filePath, "utf-8");
        context.log(`[DEBUG] Successfully read static file`);
        return context.res.text(content, 200, {
          "Content-Type": "text/html",
          "Cache-Control": "public, max-age=3600",
        });
      } catch (error) {
        context.error(`[DEBUG] Static file read failed: ${error}`);
        return context.res.text("Not Found", 404);
      }
    }

    let reqHeaders: Record<string, string> = {};
    if (req.headers instanceof Headers) {
      req.headers.forEach((value, key) => {
        reqHeaders[key] = value;
      });
    } else {
      reqHeaders = req.headers;
    }

    // Set client address
    const clientAddress = Array.isArray(
      reqHeaders["x-forwarded-for"].split(",")
    )
      ? reqHeaders["x-forwarded-for"].split(",")[0]
      : reqHeaders["x-forwarded-for"] || "127.0.0.1";
    context.log(`[DEBUG] Setting client address: ${clientAddress}`);
    Reflect.set(req, Symbol.for("astro.clientAddress"), clientAddress);

    const locals = {
      clientAddress: clientAddress || "127.0.0.1",
      runtime: "appwrite",
    };
    context.log(`[DEBUG] Created locals: ${JSON.stringify(locals, null, 2)}`);

    context.log(`[DEBUG] Attempting to render with app.render`);
    try {
      const response = await app.render(finalRequest, {
        routeData,
        locals,
        addCookieHeader: true,
      });
      context.log(`[DEBUG] Render completed successfully`);

      // Handle cookies
      if (app.setCookieHeaders) {
        context.log(`[DEBUG] Processing cookies`);
        for (const setCookieHeader of app.setCookieHeaders(response)) {
          context.log(`[DEBUG] Adding cookie header: ${setCookieHeader}`);
          response.headers.append("Set-Cookie", setCookieHeader);
        }
      }

      const headers: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        headers[key] = value;
      });
      context.log(
        `[DEBUG] Final response headers: ${JSON.stringify(headers, null, 2)}`
      );
      context.log(`[DEBUG] Response status: ${response.status}`);
      context.log(`[DEBUG] Response body type: ${typeof response.body}`);

      context.log(`[DEBUG] Sending final response`);
      return context.res.send(response.body, response.status, headers);
    } catch (error) {
      context.error(`[DEBUG] Render failed: ${error}`);
      return context.res.text("Internal Server Error", 500);
    }
  };

  return { default: handler };
};

async function createStaticHandler(context: AppwriteContext) {
  const hono = new Hono();
  const functionRoot = "src/function";

  // @ts-expect-error
  hono.get("/", async () => {
    // Try both root and client directory for index.html
    const possiblePaths = [
      join(functionRoot, "index.html"),
      join(functionRoot, "client", "index.html"),
    ];

    for (const path of possiblePaths) {
      try {
        const content = await fs.readFile(path, "utf-8");
        return context.res.text(content, 200, {
          "Content-Type": "text/html",
          "Cache-Control": "public, max-age=3600",
        });
      } catch (error) {
        continue;
      }
    }

    context.error(`Static Error: No index.html found in any location`);
    return context.res.text("Not Found", 404);
  });

  // @ts-expect-error
  hono.use("/*", async (c) => {
    const pathname = new URL(c.req.url).pathname;
    if (pathname === "/") return context.res.redirect("/");

    // Try both root and client directory for the file
    const possiblePaths = [
      join(
        functionRoot,
        pathname.startsWith("/") ? pathname.slice(1) : pathname
      ),
      join(
        functionRoot,
        "client",
        pathname.startsWith("/") ? pathname.slice(1) : pathname
      ),
    ];

    for (const filePath of possiblePaths) {
      try {
        const stat = await fs.stat(filePath);

        if (stat.isFile()) {
          const ext = pathname.split(".").pop() || "";
          const contentType =
            MIME_TYPES[("." + ext) as keyof typeof MIME_TYPES] ||
            "application/octet-stream";
          const content = await fs.readFile(filePath);
          const fileType = await fileTypeFromFile(filePath);
          const finalContentType = fileType?.mime || contentType;

          if (
            !finalContentType.startsWith("text/") &&
            !finalContentType.includes("javascript")
          ) {
            return context.res.binary(content, 200, {
              "Content-Type": finalContentType,
              "Cache-Control": pathname.includes("/_astro/")
                ? "public, max-age=31536000, immutable"
                : "public, max-age=3600",
            });
          }

          return context.res.text(content.toString(), 200, {
            "Content-Type": finalContentType,
            "Cache-Control": pathname.includes("/_astro/")
              ? "public, max-age=31536000, immutable"
              : "public, max-age=3600",
          });
        }
      } catch (error) {
        continue;
      }
    }

    context.error(`File not found in any location: ${pathname}`);
    return context.res.text("Not Found", 404);
  });

  return { handler: hono.fetch.bind(hono) };
}

export default async function main(context: AppwriteContext) {
  context.log(`Appwrite Function: ${context.req.url}`);

  // Normalize the working directory
  const baseDir = process.cwd();
  context.log(`[DEBUG] Initial CWD: ${baseDir}`);

  // Count occurrences of "server" in the path
  const serverCount = (baseDir.match(/server/g) || []).length;
  context.log(`[DEBUG] Server occurrences in path: ${serverCount}`);

  // If only one "server" in path, we need to look for nested structure
  const functionRoot =
    serverCount === 1
      ? join(baseDir, "src", "function")
      : serverCount === 2
      ? join(baseDir, "..") // We're already in the right server directory
      : "src/function"; // Fallback
  process.chdir(functionRoot);

  context.log(`[DEBUG] Normalized function root: ${functionRoot}`);

  try {
    // Check if this is a static asset request
    const pathname = new URL(context.req.url!).pathname;
    if (
      pathname.includes("/_astro/") ||
      pathname.endsWith(".css") ||
      pathname.endsWith(".js") ||
      pathname.endsWith(".json") ||
      pathname.endsWith(".png") ||
      pathname.endsWith(".jpg") ||
      pathname.endsWith(".svg") ||
      pathname.endsWith(".webp") ||
      pathname.endsWith(".ico")
    ) {
      const staticHandler = await createStaticHandler(context);
      return await staticHandler.handler(context.req as any);
    }

    // Try SSR first for HTML requests
    const serverDir = join(functionRoot, "server");
    context.log(`[DEBUG] Looking for server dir at: ${serverDir}`);

    const manifestFile = await findManifestFile(serverDir, context);

    if (manifestFile) {
      try {
        context.log("Running in SSR/Hybrid mode");
        const manifestPath = new URL(
          `file:///${join(serverDir, manifestFile)}`
        );

        context.log(`[DEBUG] Loading manifest from: ${manifestPath.href}`);
        const manifest = await import(manifestPath.href);
        const exports = await createExports(manifest.manifest);
        const response = await exports.default(context.req, context);
        context.log(`[DEBUG] Response: ${JSON.stringify(response, null, 4)}`);
        if (response.statusCode !== 404) {
          if (response.body && typeof response.body === "string") {
            context.log(`[DEBUG] Returning text response`);
            return context.res.text(
              response.body,
              response.statusCode,
              response.headers as Record<string, string>
            );
          } else if (response.body && response.body instanceof ReadableStream) {
            context.log(`[DEBUG] Returning binary response`);
            const body = await new Response(response.body).arrayBuffer();
            return context.res.binary(
              new Uint8Array(body),
              response.statusCode,
              response.headers as Record<string, string>
            );
          } else {
            context.log(`[DEBUG] Returning send response`);
            return context.res.send(
              response.body,
              response.statusCode,
              response.headers as Record<string, string>
            );
          }
        }

        return context.res.text("Not Found", 404);
      } catch (error) {
        context.error(`SSR Error: ${error}`);
        return context.res.text("Internal Server Error", 500);
      }
    }

    // Fallback to static handler
    const staticHandler = await createStaticHandler(context);
    return await staticHandler.handler(context.req as any);
  } catch (error) {
    context.error(`Error: ${error}`);
    return context.res.text("Internal Server Error", 500);
  }
}
