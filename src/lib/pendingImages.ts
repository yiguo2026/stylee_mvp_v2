// Shared store for passing image URIs between routes.
// Route params can fail on web when navigating across stacks,
// so we use a global variable as a reliable alternative.

let pendingUris: string[] | null = null;

export function setPendingImages(uris: string[]) {
  pendingUris = uris;
}

export function consumePendingImages(): string[] | null {
  const result = pendingUris;
  pendingUris = null;
  return result;
}
