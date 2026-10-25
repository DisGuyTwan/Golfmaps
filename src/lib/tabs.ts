/** Switches tab like a click on the tab bar: new history entry, then a hashchange. */
export function goToTab(hash: "" | "#incentives" | "#roi" | "#proposal") {
  const { pathname, search } = window.location;
  window.history.pushState(null, "", `${pathname}${search}${hash}`);
  window.dispatchEvent(new HashChangeEvent("hashchange"));
}
