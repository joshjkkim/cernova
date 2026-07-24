-- Call-site provenance for CALLS.
-- Run in Supabase SQL Editor.
--
-- Records WHERE in the user's code a traced call was made, so downstream agents
-- (an MCP, a GitHub PR bot) can jump straight to the source instead of grepping.
--
--   code_filepath  repo-relative path, e.g. "sample-app/chatbot.ts"
--   code_lineno    1-based line of the call site
--   code_function  enclosing function name (or "<anonymous>")
--   commit_sha     commit the running code was built from — anchors the line number
--
-- All nullable: SDKs (v0.1.6+) capture them via stack walk; OTel maps them from
-- code.* span attributes; imports and older SDKs leave them NULL. The existing
-- strip-None insert path means no write changes are required for rows without them.

ALTER TABLE "CALLS" ADD COLUMN IF NOT EXISTS code_filepath text;
ALTER TABLE "CALLS" ADD COLUMN IF NOT EXISTS code_lineno   integer;
ALTER TABLE "CALLS" ADD COLUMN IF NOT EXISTS code_function text;
ALTER TABLE "CALLS" ADD COLUMN IF NOT EXISTS commit_sha    text;
