import { afterEach, describe, expect, it, vi } from "vitest";

import { extractRecipeFromHtml, extractRecipeWithFallbacks } from "@/src/recipe-extraction";

const directRecipeHtml = `
<!doctype html>
<html>
  <head>
    <title>Lemon Chicken and Orzo</title>
    <script type="application/ld+json">
      {
        "@context":"https://schema.org/",
        "@type":"Recipe",
        "name":"Lemon Chicken and Orzo",
        "recipeIngredient":[
          "2 chicken breasts",
          "1 cup orzo pasta",
          "2 tablespoons olive oil"
        ],
        "recipeInstructions":[
          {"@type":"HowToStep","name":"Heat","text":"olive oil in a skillet over medium heat."},
          {"@type":"HowToStep","name":"Add","text":"garlic and saute until fragrant."},
          {"@type":"HowToStep","text":"Serve hot."}
        ]
      }
    </script>
  </head>
  <body>
    <a href="#recipe-card">Jump to recipe</a>
    <div id="recipe-card">
      <h2>Ingredients</h2>
      <ul>
        <li>2 chicken breasts</li>
        <li>1 cup orzo pasta</li>
        <li>2 tablespoons olive oil</li>
      </ul>
      <h2>Instructions</h2>
      <ol>
        <li>Heat olive oil in a skillet over medium heat.</li>
        <li>Add garlic and saute until fragrant.</li>
        <li>Serve hot.</li>
      </ol>
    </div>
  </body>
</html>
`;

describe("recipe extraction", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it("repairs truncated imperative schema steps", () => {
    const result = extractRecipeFromHtml(directRecipeHtml, "https://example.com/recipe");

    expect(result.status).toBe("recipe_extracted");
    expect(result.recipe?.steps[0]?.text).toBe("Heat olive oil in a skillet over medium heat.");
    expect(result.recipe?.steps[1]?.text).toBe("Add garlic and saute until fragrant.");
  });

  it("extracts a focused anchor attempt from jump-to-recipe markup", () => {
    const result = extractRecipeFromHtml(directRecipeHtml, "https://example.com/recipe");
    const anchorAttempt = result.attempts.find((attempt) => attempt.fetchStrategy === "recipe_anchor_follow");

    expect(anchorAttempt).toBeDefined();
    expect(anchorAttempt?.contentVariant).toBe("recipe_anchor_html");
    expect(anchorAttempt?.status).toBe("recipe_extracted");
  });

  it("ignores a bare hash jump link instead of treating it as a selector", () => {
    const result = extractRecipeFromHtml(
      directRecipeHtml.replace('href="#recipe-card"', 'href="#"'),
      "https://example.com/recipe",
    );

    expect(result.status).toBe("recipe_extracted");
    expect(result.attempts.some((attempt) => attempt.fetchStrategy === "recipe_anchor_follow")).toBe(false);
  });

  it("does not treat instruction prose beside an ingredient heading as an ingredient", () => {
    const html = `
      <main><h1>Simple soup</h1><h2>Ingredients</h2>
      <p>2 carrots</p><p>1 onion</p><p>Cook the vegetables over medium heat until softened.</p>
      <h2>Instructions</h2><p>Heat oil in a pot.</p><p>Add vegetables and cook until tender.</p></main>`;
    const result = extractRecipeFromHtml(html, "https://example.com/soup");

    expect(result.recipe?.ingredients.map((ingredient) => ingredient.originalText)).toEqual(["2 carrots", "1 onion"]);
  });

  it("parses complete or-ingredients as a shared-quantity choice", () => {
    const result = extractRecipeFromHtml(
      `<script type="application/ld+json">{"@context":"https://schema.org","@type":"Recipe","name":"Choice soup","recipeIngredient":["1 cup milk or water"],"recipeInstructions":["Stir."]}</script>`,
      "https://example.com/choice-soup",
    );

    expect(result.recipe?.ingredients[0]).toMatchObject({
      originalText: "1 cup milk or water",
      amountText: "1",
      unit: "cup",
      ingredientText: "milk or water",
      alternativeIngredientTexts: ["milk", "water"],
    });
  });

  it("short-circuits after a high-confidence direct fetch", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      url: "https://example.com/recipe",
      headers: new Headers({ "content-type": "text/html" }),
      text: async () => directRecipeHtml,
    });
    vi.stubGlobal("fetch", fetchMock);

    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("preview")),
      locator: vi.fn().mockImplementation(() => ({
        allInnerTexts: async () => [],
        nth: () => ({ click: vi.fn().mockResolvedValue(undefined) }),
      })),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const launch = vi.fn().mockResolvedValue(browser);
    vi.doMock("playwright", () => ({
      chromium: { launch },
    }));

    const result = await extractRecipeWithFallbacks("https://example.com/recipe");

    expect(result.status).toBe("recipe_extracted");
    expect(result.confidence).toBe("high");
    expect(launch).toHaveBeenCalledTimes(1);
    expect(result.attempts.some((attempt) => Boolean(attempt.pagePreviewDataUrl))).toBe(true);
  });

  it("falls back to browser-rendered extraction when direct fetch fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: "Forbidden",
        url: "https://example.com/recipe",
        headers: new Headers({ "content-type": "text/html" }),
        text: async () => "",
      });
    vi.stubGlobal("fetch", fetchMock);

    const click = vi.fn().mockResolvedValue(undefined);
    const locator = vi.fn().mockImplementation(() => ({
      allInnerTexts: async () => ["Accept", "Jump to recipe"],
      nth: () => ({ click }),
      innerText: async () =>
        "Ingredients\n2 chicken breasts\n1 cup orzo pasta\n2 tablespoons olive oil\nInstructions\nHeat olive oil in a skillet.\nAdd garlic.\nServe hot.",
    }));
    const page = {
      goto: vi.fn().mockResolvedValue(undefined),
      waitForTimeout: vi.fn().mockResolvedValue(undefined),
      content: vi.fn().mockResolvedValue(directRecipeHtml),
      screenshot: vi.fn().mockResolvedValue(Buffer.from("preview")),
      locator,
      url: vi.fn().mockReturnValue("https://example.com/recipe"),
    };
    const browser = {
      newPage: vi.fn().mockResolvedValue(page),
      close: vi.fn().mockResolvedValue(undefined),
    };
    const launch = vi.fn().mockResolvedValue(browser);
    vi.doMock("playwright", () => ({
      chromium: { launch },
    }));

    const result = await extractRecipeWithFallbacks("https://example.com/recipe");

    expect(result.status).toBe("recipe_extracted");
    expect(result.fetchStrategy).toBe("browser_rendered_html");
    expect(result.attempts.some((attempt) => attempt.fetchStrategy === "browser_rendered_html")).toBe(true);
  });

  it("classifies clearly non-recipe pages as not_recipe", () => {
    const result = extractRecipeFromHtml(
      `
      <html>
        <head><title>About our studio</title></head>
        <body>
          <main>
            <h1>About our studio</h1>
            <p>We offer branding, workshops, and event planning.</p>
          </main>
        </body>
      </html>
      `,
      "https://example.com/about",
    );

    expect(result.status).toBe("not_recipe");
    expect(result.failureReason).toBe("Page did not look like a recipe.");
  });
});
