# catalog/

Put the generated `generated.json` here (created by `npm run import-swagger -- swagger.json`).
Every endpoint in it becomes an extra MCP tool named `sumit_api_<module>_<controller>_<action>` unless a curated tool already covers the same path.
The file is loaded once at startup (override the location with `SUMIT_GENERATED_CATALOG=/path/to/generated.json`).
