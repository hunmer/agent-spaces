const hasImage = (image) => (
  typeof image === 'string' || Boolean(image?.src || image?.url)
);

export function hasReskinLogImageOutput(data) {
  if (Array.isArray(data?.images) && data.images.some(hasImage)) return true;
  return Array.isArray(data?.imageFlow?.outputs) && data.imageFlow.outputs.some(hasImage);
}
