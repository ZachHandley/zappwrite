import { getFilePreviewUrl } from "appwrite-utils";
import type { Models } from "node-appwrite";

export interface ImageTransformOptions {
  width?: number;
  height?: number;
  gravity?: string;
  quality?: number;
  borderWidth?: number;
  borderColor?: string;
  borderRadius?: number;
  opacity?: number;
  rotation?: number;
  background?: string;
  output?: string;
}

export interface AppwriteImageConfig {
  endpoint: string;
  projectId: string;
  bucketId: string;
}

export function createImageTransformer(config: AppwriteImageConfig) {
  return function transformImage(
    fileId: string,
    options: ImageTransformOptions = {},
    jwt?: Models.Jwt
  ) {
    return getFilePreviewUrl(
      config.endpoint,
      config.projectId,
      config.bucketId,
      fileId,
      jwt,
      options
    );
  };
}
