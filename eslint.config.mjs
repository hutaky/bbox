import js from "@eslint/js";
import nextPlugin from "@next/eslint-plugin-next";

export default [
  js.configs.recommended,
  nextPlugin.configs["core-web-vitals"],
  {
    rules: {
      "react/react-in-jsx-scope": "off"
    }
  }
];
