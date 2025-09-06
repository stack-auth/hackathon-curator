# What to pass to the server?
Pass a json object of the form {"file":<filenameFromRootOfRepo>} when invoking the server.
Example: {"file": "algo/src/index.ts"}

# Test command:
curl -X POST http://localhost:4000/last-commit  -H "Content-Type: application/json"  -d '{"file": "algo/src/index.ts"}'