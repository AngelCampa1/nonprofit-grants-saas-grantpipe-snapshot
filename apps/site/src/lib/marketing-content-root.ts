import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getMarketingContentCollectionBase } from "@grantpipe/shared/public-kb";

const appDirectory = fileURLToPath(new URL("../../", import.meta.url));

export const marketingContentDirectory = join(
  appDirectory,
  getMarketingContentCollectionBase("guides"),
  "..",
);

export function marketingContentFile(relativePath: string): URL {
  return pathToFileURL(join(marketingContentDirectory, relativePath));
}
