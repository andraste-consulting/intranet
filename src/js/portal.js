/* Client-side search/filter for the portal cards. */
(function () {
  "use strict";

  var input = document.getElementById("portal-filter");
  var empty = document.getElementById("portal-empty");
  if (!input) return;

  var cards = Array.prototype.slice.call(
    document.querySelectorAll(".portal-card-wrap")
  );
  var groups = Array.prototype.slice.call(
    document.querySelectorAll(".portal-group")
  );

  function applyFilter() {
    var query = input.value.trim().toLowerCase();
    var anyVisible = false;

    cards.forEach(function (card) {
      var haystack =
        (card.dataset.name || "") + " " + (card.dataset.description || "");
      var match = query === "" || haystack.indexOf(query) !== -1;
      card.hidden = !match;
      if (match) anyVisible = true;
    });

    // Hide a group entirely when none of its cards match.
    groups.forEach(function (group) {
      var visibleInGroup = group.querySelectorAll(
        ".portal-card-wrap:not([hidden])"
      ).length;
      group.hidden = visibleInGroup === 0;
    });

    if (empty) empty.hidden = anyVisible;
  }

  input.addEventListener("input", applyFilter);

  // Press "/" to jump to the search box.
  document.addEventListener("keydown", function (e) {
    if (e.key === "/" && document.activeElement !== input) {
      e.preventDefault();
      input.focus();
    }
  });
})();
