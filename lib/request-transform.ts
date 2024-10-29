import { AppwriteRequest } from "./appwrite-request.js";

export const createFetchRequest = (req: AppwriteRequest): Request => {
  // Construct the full URL
  const scheme = req.scheme || "http";
  const host = req.host || "localhost";
  let port = "";

  // Only include the port if it's not the default for the scheme
  if (req.port) {
    const portNumber = Number(req.port);
    const isDefaultPort =
      (scheme === "http" && portNumber === 80) ||
      (scheme === "https" && portNumber === 443);

    if (!isDefaultPort) {
      port = `:${req.port}`;
    }
  }

  // Ensure path starts with '/'
  const path =
    req.path && req.path.startsWith("/") ? req.path : `/${req.path || ""}`;
  const queryString = req.queryString ? `?${req.queryString}` : "";

  const url = `${scheme}://${host}${port}${path}${queryString}`;

  console.log("[DEBUG] FINAL URL:", url);

  // Extract method and headers
  const method = req.method || "GET";
  const headers = new Headers(req.headers || {});

  // Determine the appropriate body
  let requestBody: any = undefined;
  const contentType = headers.get("content-type") || "";

  if (!["GET", "HEAD"].includes(method.toUpperCase())) {
    if (contentType.startsWith("application/json")) {
      requestBody = req.bodyJson !== null ? JSON.stringify(req.bodyJson) : "{}";
      headers.set("Content-Type", "application/json");
    } else if (contentType.startsWith("text/")) {
      requestBody = req.bodyText;
    } else if (req.bodyBinary && req.bodyBinary.length > 0) {
      requestBody = req.bodyBinary;
    }
  }

  // Prepare the RequestInit object
  const requestInit: RequestInit = {
    method,
    headers,
    body: requestBody,
  };

  // Set 'duplex' if necessary (Node.js Fetch API requirement)
  if (
    ["POST", "PUT", "PATCH", "DELETE"].includes(method.toUpperCase()) &&
    requestBody !== undefined
  ) {
    // @ts-ignore
    requestInit.duplex = "half";
  }

  // Create and return the Fetch API Request object
  const fetchRequest = new Request(url, requestInit);

  return fetchRequest;
};
