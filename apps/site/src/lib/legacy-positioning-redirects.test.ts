import { describe, expect, it } from "vitest";

import { resolveLegacyPositioningRedirect } from "./legacy-positioning-redirects";

describe("resolveLegacyPositioningRedirect", () => {
  it.each([
    [
      "https://grantpipe.com/resources/guides/grant-funded-nonprofit-operating-system",
      "https://grantpipe.com/resources/guides/grant-management-software-for-nonprofits/",
    ],
    [
      "https://grantpipe.com/resources/guides/grant-funded-nonprofit-operating-system/",
      "https://grantpipe.com/resources/guides/grant-management-software-for-nonprofits/",
    ],
    [
      "https://grantpipe.com/glossary/grant-funded-nonprofit-operating-system",
      "https://grantpipe.com/glossary/grant-compliance/",
    ],
    [
      "https://grantpipe.com/glossary/grant-funded-nonprofit-operating-system/",
      "https://grantpipe.com/glossary/grant-compliance/",
    ],
  ])("redirects %s to %s", (source, target) => {
    expect(resolveLegacyPositioningRedirect(new URL(source))?.toString()).toBe(target);
  });

  it("does not redirect unrelated paths", () => {
    expect(
      resolveLegacyPositioningRedirect(
        new URL("https://grantpipe.com/resources/guides/grant-compliance/"),
      ),
    ).toBeNull();
  });

  it("drops query strings and fragments from canonical redirect targets", () => {
    expect(
      resolveLegacyPositioningRedirect(
        new URL(
          "https://grantpipe.com/glossary/grant-funded-nonprofit-operating-system/?utm_source=test#old",
        ),
      )?.toString(),
    ).toBe("https://grantpipe.com/glossary/grant-compliance/");
  });
});
