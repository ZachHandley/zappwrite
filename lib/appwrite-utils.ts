import { Client, Functions, Models, Query, Runtime } from "node-appwrite";
import { InputFile } from "node-appwrite/file";
import path from "path";
import { create } from "tar";
import { ulid } from "ulidx";
import fs from "node:fs/promises";
import { fileURLToPath } from "node:url";

export interface AppwriteFunctionOptions {
  endpoint: string;
  projectId: string;
  apiKey: string;
  functionId?: string;
  functionName?: string;
  timeout: number;
  envVariables?: Record<string, string>;
}

export async function createAppwriteFunction(
  options: AppwriteFunctionOptions,
  buildDir: string
) {
  console.log("Starting function deployment...");
  console.log("Build directory:", buildDir);

  // For hybrid/server builds, we need the parent dist directory
  const distDir = path.basename(buildDir) === 'client' ? path.dirname(buildDir) : buildDir;
  console.log("Distribution directory:", distDir);
  
  const tarFileName = "function.tar.gz";
  const tarFilePath = path.join(distDir, tarFileName);
  let tarFileCreated = false;

  try {
    // Copy adapter to root of dist directory (will be function entrypoint)
    const adapterFunctionPath = fileURLToPath(
      new URL('../dist/appwrite-adapter.cjs', import.meta.url)
    );

    // Ensure the adapter file exists
    try {
      await fs.access(adapterFunctionPath);
    } catch (error) {
      throw new Error(
        'Adapter file not found. Please ensure you have built the project with `npm run build` first.'
      );
    }

    // Copy adapter to dist root
    await fs.copyFile(adapterFunctionPath, path.join(distDir, 'appwrite-adapter.cjs'));
    console.log("Copied adapter to dist directory:", path.join(distDir, 'appwrite-adapter.cjs'));

    // List files before bundling
    const files = await fs.readdir(distDir, { recursive: true });
    console.log("Files in deployment directory:", files);

    const client = new Client()
      .setEndpoint(options.endpoint)
      .setProject(options.projectId)
      .setKey(options.apiKey);

    const functions = new Functions(client);

    // Create tarball from dist directory (includes adapter + client/server dirs)
    console.log("Creating function bundle...");
    await create(
      {
        gzip: true,
        file: tarFilePath,
        cwd: distDir,
      },
      ["."]
    );
    tarFileCreated = true;

    let appwriteFunction: Models.Function | undefined;

    try {
      if (!options.functionId) {
        console.log("Looking up function by name...");
        const functionsResp = await functions.list([
          Query.limit(1),
          Query.equal("name", options.functionName || "Zappwrite SSR"),
        ]);
        if (functionsResp.functions.length > 0) {
          options.functionId = functionsResp.functions[0].$id;
        } else {
          options.functionId = ulid();
          console.log("Created new function ID:", options.functionId);
        }
      }

      appwriteFunction = await functions.get(options.functionId);
      console.log("Updating existing Appwrite function...");
      await functions.update(
        options.functionId,
        options.functionName || "Zappwrite SSR",
        Runtime.Node180,
        ["any"],
        undefined,
        undefined,
        options.timeout || 30,
        true,
        true,
        "appwrite-adapter.cjs"
      );
    } catch (error: any) {
      if (error.code === 404 || error.response?.code === 404) {
        console.log("Creating new Appwrite function...");
        appwriteFunction = await functions.create(
          options.functionId || ulid(),
          options.functionName || "Zappwrite SSR",
          Runtime.Node180,
          ["any"],
          undefined,
          undefined,
          options.timeout || 30,
          true,
          true,
          "appwrite-adapter.cjs"
        );
      } else {
        throw error;
      }
    }

    if (options.envVariables) {
      console.log("Updating environment variables...");
      await updateEnvironmentVariables(
        functions,
        appwriteFunction.$id,
        options.envVariables
      );
    }

    console.log("Creating deployment...");
    const codeFile = InputFile.fromPath(tarFilePath, tarFileName);
    await functions.createDeployment(
      appwriteFunction.$id,
      codeFile,
      true,
      "appwrite-adapter.cjs"
    );

    console.log("Deployment successful!");
    return appwriteFunction.$id;
  } catch (error) {
    console.error("Error deploying Appwrite function:", error);
    throw error;
  } finally {
    if (tarFileCreated) {
      try {
        await fs.unlink(tarFilePath);
        console.log("Cleaned up tarball");
      } catch (error) {
        console.warn("Failed to clean up tarball:", error);
      }
    }
  }
}

async function updateEnvironmentVariables(
  functions: Functions,
  functionId: string,
  newVars: Record<string, string>
) {
  const variablesResp = await functions.listVariables(functionId);
  const currentVars = variablesResp.variables.reduce((acc, v) => {
    acc[v.key] = v.$id;
    return acc;
  }, {} as Record<string, string>);

  // Delete variables that aren't in newVars
  for (const [key, id] of Object.entries(currentVars)) {
    if (!(key in newVars)) {
      await functions.deleteVariable(functionId, id);
    }
  }

  // Create or update variables
  for (const [key, value] of Object.entries(newVars)) {
    if (key in currentVars) {
      await functions.updateVariable(functionId, currentVars[key], key, value);
    } else {
      await functions.createVariable(functionId, key, value);
    }
  }
}
