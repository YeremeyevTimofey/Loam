# Launch checklist

How to get Loam in front of people, in the order that works: first make it safe to try, then be listed where people look, then one concentrated push, then keep going. For publishing the files themselves (release, website, npm) see [PUBLISHING.md](PUBLISHING.md).

Nothing here is a promise of a number of stars. The first hundred usually come from people you know; spikes come from Hacker News, Reddit and Product Hunt when a post lands; the rest is steady work. Rules of the sites below change: read the current rules before posting.

## 1. Before anything is public

- [ ] The release exists: `v0.1.0` tagged, `loam.mcpb` downloads from `/download/loam.mcpb`, `loam-mcp` is on npm (see [PUBLISHING.md](PUBLISHING.md)). Until then the download address leads to a GitHub "404" (a local dev server hands out the extension you built with `npm run pack:mcpb` instead).
- [ ] The real domain is in [`site.config.json`](../site.config.json) and the site is live.
- [ ] **Tried in the real clients**, on a computer that is not yours: Claude Desktop (the `.mcpb`), and the config for each agent you name on the site (Cursor, Codex, VS Code, Gemini CLI, Windsurf, Claude Code). The tests prove the server and the generated configs; they do not run those programs. Do not claim an agent works until you have seen it work.
- [ ] The three drawn pictures in the install guide (`apps/web/public/shots/install-*.png`) are replaced with real screenshots.
- [ ] A 60 to 90 second demo (GIF or video) is at the top of the README.
- [ ] The privacy policy sentence is in the README (some directories reject without one): the app and the server make no network requests, nothing leaves the computer.
- [ ] People you trust have used it end to end and you have fixed what they hit. Ask two or three for a sentence you may quote.

## 2. The repository page

Run in a clone of the repository (needs the GitHub CLI signed in as the owner):

```bash
gh repo edit \
  --description "Work context for AI agents: your processes, examples and corrections as plain files you own. Works with Claude, Cursor, Codex, Gemini and any MCP agent. Local-first, no account." \
  --homepage "https://loam.dev" \
  --enable-discussions \
  --add-topic mcp --add-topic mcp-server --add-topic model-context-protocol \
  --add-topic ai-agents --add-topic agents-md --add-topic agent-skills \
  --add-topic claude --add-topic cursor --add-topic codex --add-topic gemini-cli \
  --add-topic knowledge-base --add-topic local-first
```

(Use your real domain for `--homepage`.) By hand in the browser: Settings → General → **Social preview** → upload [`apps/web/public/og.png`](../apps/web/public/og.png), and pin the repository on your GitHub profile. Label three to five small issues `good first issue`.

## 3. Listings (free, they keep working)

Do these on launch day, in this order. Each takes minutes except where noted.

| Where | What to do |
|---|---|
| **Official MCP Registry** | [PUBLISHING.md](PUBLISHING.md#6-list-the-server-in-the-official-mcp-registry): three commands with the generated `server.json`. Other directories (Smithery, PulseMCP) say they read from it |
| **awesome-mcp-servers** | Pull request to [punkpeye/awesome-mcp-servers](https://github.com/punkpeye/awesome-mcp-servers/blob/main/CONTRIBUTING.md): fork, add one line in the right category, rebase before you open it. It can take weeks to be looked at |
| **mcpservers.org** | The form at <https://mcpservers.org/submit> (the list by wong2 takes no pull requests) |
| **Glama, mcp.so** | Glama indexes open repositories by itself; claim yours. mcp.so takes a repository address for free (ignore the paid option) |
| **Cline marketplace** | An issue in [cline/mcp-marketplace](https://github.com/cline/mcp-marketplace): repository address, a 400×400 PNG logo (`sips -z 400 400 apps/web/public/icon-512.png --out loam-400.png` on a Mac), and a sentence confirming that Cline installed it from the README or [llms-install.md](../llms-install.md) |
| **Cursor** | A post in the forum's [Showcase → Built for Cursor](https://forum.cursor.com/c/showcase/9). The README has an "Add to Cursor" button |
| **Skill lists** | [awesome-agent-skills](https://github.com/VoltAgent/awesome-agent-skills) and [claudeskills.info](https://claudeskills.info/): optional, the starter skills are the entry |
| **Open-source directories** | AlternativeTo, OpenAlternative, DevHunt. Skip the paid AI-tool directories until the free ones show they send visitors |

Not worth it for Loam: Smithery wants a remote HTTP server (Loam runs on the person's computer), and Anthropic's own directory no longer takes `.mcpb` extensions (only plugins), so `loam.mcpb` stays a direct download.

## 4. Launch day

One concentrated push, a Tuesday to Thursday morning in the US (afternoon in Europe), when you can stay at the keyboard for the day.

1. **Show HN** first. Title `Show HN: Loam – <what it is in plain words>`, link the repository, put the backstory in the first comment, answer every question, never ask for votes. Write it yourself: the moderators ask for text a person wrote.
2. **Reddit**, one or two communities, each post written for that community (r/ClaudeAI, r/opensource; read each sidebar first; r/selfhosted keeps young projects in a megathread). No copy-pasted text.
3. **Discord and forums** where people already ask for this: the Claude Discord, the Cursor forum, the OpenAI developer community showcase.
4. Reply fast for the first twelve hours. A thoughtful answer in a thread is worth more than a second post.

**Product Hunt** works better a few days later, once the demo video exists: tagline up to 60 characters, at least three real screenshots, a first comment with the story. It goes live at 00:01 Pacific time.

## 5. After the push

- Publish the two videos: a three-minute "from nothing to an agent that knows my work" for people who are not technical, and a longer one on how it is built for those who are.
- Write the article: the decisions (plan and diff before every write, the skill scanner, no network), the tests, the accessibility work. A copy on dev.to or Hashnode, and one in Russian for Habr if you want that audience (read its current rules on promotion first).
- Newsletters take a link to something people can already try: [Changelog News](https://changelog.com/news/submit) takes open-source projects; Console.dev looks for tools whose main user is a developer, so Loam is a weaker fit there.
- Ship small releases often. A repository with a commit this week looks alive.
- Put it on your CV and LinkedIn with numbers you can show: stars, npm downloads, release downloads, tests, a link to the article.

## 6. Things not to do

- Do not buy stars, trade stars, or ask for them in groups. Fake stars are common, GitHub removes them, and a reader who finds out distrusts everything else on your CV.
- Do not vote-ring Hacker News or Product Hunt, and do not ask friends to leave glowing comments.
- Do not post the same text everywhere.
- Do not say it works with an agent you have not tried.
- Check that your employer's rules allow a personal project to be presented and promoted.

## 7. Know what works

GitHub keeps traffic sources for only 14 days (Insights → Traffic). Write down, each week, the stars, the referrers, the npm downloads and the release downloads, and do more of what moved them. The landing page counts visits with Plausible; the app counts nothing, by design.
