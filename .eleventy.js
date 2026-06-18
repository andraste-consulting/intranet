module.exports = function (eleventyConfig) {
  // --- Vendor assets (copied from node_modules so the portal works offline) ---

  // UIkit (CSS + JS + icon library)
  eleventyConfig.addPassthroughCopy({
    "node_modules/uikit/dist/css/uikit.min.css": "vendor/uikit/uikit.min.css",
    "node_modules/uikit/dist/js/uikit.min.js": "vendor/uikit/uikit.min.js",
    "node_modules/uikit/dist/js/uikit-icons.min.js": "vendor/uikit/uikit-icons.min.js"
  });

  // Font Awesome (CSS + webfonts). The CSS must keep its `css/` subdirectory:
  // all.min.css references fonts via `../webfonts/`, so the css/ and webfonts/
  // folders have to sit side by side under vendor/fontawesome/.
  eleventyConfig.addPassthroughCopy({
    "node_modules/@fortawesome/fontawesome-free/css/all.min.css": "vendor/fontawesome/css/all.min.css",
    "node_modules/@fortawesome/fontawesome-free/webfonts": "vendor/fontawesome/webfonts"
  });

  // --- Project assets ---
  eleventyConfig.addPassthroughCopy({ "src/css": "css" });
  eleventyConfig.addPassthroughCopy({ "src/js": "js" });
  eleventyConfig.addPassthroughCopy({ "src/assets": "assets" });

  // Rebuild when CSS/JS/data change
  eleventyConfig.addWatchTarget("src/css/");
  eleventyConfig.addWatchTarget("src/js/");

  // Current year, used in the footer
  eleventyConfig.addFilter("year", () => new Date().getFullYear());

  return {
    dir: {
      input: "src",
      output: "_site",
      includes: "_includes",
      data: "_data"
    },
    htmlTemplateEngine: "njk",
    markdownTemplateEngine: "njk"
  };
};
