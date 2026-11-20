import { clsx, type ClassValue } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Teach tailwind-merge about our custom type scale so `text-small` is not mistaken for a color.
const merge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [{ text: ["hero", "figure", "title", "section", "body", "small", "caption"] }],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return merge(clsx(inputs));
}
