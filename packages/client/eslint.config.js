import base from "@instagramjs/eslint-config";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: ["dist"],
  },
  base,
);
