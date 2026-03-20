// Redirect homepage to the Following feed.
// Instagram is a SPA, so we observe URL changes via history API.
function checkRedirect() {
  if (location.pathname === "/" && !location.search.includes("variant=following")) {
    location.replace("/?variant=following");
  }
}

checkRedirect();

// Patch pushState/replaceState to detect SPA navigations
const origPush = history.pushState;
const origReplace = history.replaceState;
history.pushState = function() { origPush.apply(this, arguments); checkRedirect(); };
history.replaceState = function() { origReplace.apply(this, arguments); checkRedirect(); };
window.addEventListener("popstate", checkRedirect);
