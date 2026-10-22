# burnline

burnline is a [Claude Code mod](https://code.claude.com/docs/en/plugins/mods/overview). It shows one line of text next to the model selector. The line shows how much of your usage limits you use. It also shows the progress of Claude through the current task.

![burnline in the Claude Code desktop app, next to the model selector](docs/screenshot.png)

This is the full line in a wide window:

```
burnline  5h ▰¦▱▱▱▱ 29% ↻4h10m | 7d ▰▰▰▱▱▱▱¦ 49% ↻1h | 8✓ ●●●◉○○○ +6 11/21
```

## What the line shows

| Part | Meaning |
| --- | --- |
| <code>5h&nbsp;▰▱▱▱▱&nbsp;29%</code> | The percentage of your 5-hour limit that you used. One box is one hour. |
| <code>7d&nbsp;▰▰▰▱▱▱▱&nbsp;49%</code> | The percentage of your 7-day limit that you used. One box is one day. |
| `¦` | The percentage of the time window that is gone. If the bar is longer than this mark, you use the limit faster than the time goes. |
| `↻4h10m` | The time until the limit resets |
| `●●●◉○○○` | The tasks of Claude: `●` is complete, `◉` is in progress, `○` is not started. The line shows a maximum of 7 tasks near the current task. |
| `8✓` | The number of complete tasks before the dots |
| `+6` | The number of tasks after the dots |
| `11/21` | The number of complete tasks and the total number of tasks |

The task part shows only when Claude has a task list. Claude usually makes a task list for a goal with many steps. When all tasks are complete, burnline removes the list at your next prompt.

burnline updates the line after each reply and after each change to a task. It also updates the line one time each minute.

The line shows immediately when a session opens. Before the first reply, the line shows the last known values. If burnline has no values, the bars are empty and show `–%`.

## Install

1. Open a Claude Code session.
2. Type this command:

   ```
   /plugin install burnline --marketplace matrac/burnline
   ```

3. Type `y` to add the marketplace.
4. Select a scope. Use the user scope to use burnline in all sessions.

## Requirements

- Claude Code 2.1.287 or a later version. Mods are on by default from this version.
- A Claude subscription (Pro or Max) for the usage bars. An API key has no plan limits. With an API key, the line shows only the tasks.
- The terminal or the Code tab of the desktop app. The VS Code panel does not show the output of mods.

## Limits

- The status line is plain text. It cannot show colors.
- Claude Code shows the name of the mod (`burnline`) before the line. A mod cannot remove the name.
- If the window is narrow, Claude Code cuts the line and shows `…`.
- Mods cannot get the 7-day limits for each model (Opus and Sonnet). The line shows only the total 5-hour and 7-day limits.
- burnline does not show the tasks of subagents and teammates. The dots show only the tasks of the main conversation.

## Access

A mod has the same permissions as you. `claude plugin validate` shows the full list of access for burnline:

- It uses the clock, the usage values of the session, the saved values of the session, and the status line.
- It uses the plugin storage of Claude Code. burnline keeps the last usage values there. A new session can then show the values before its first reply.
- It reads your 5-hour and 7-day usage percentages and reset times. It also reads the names and the status of the tasks of Claude.
- It does not read or write files. It does not use the network. It does not start programs or use a model. No data goes off your computer.

To do a check of the access yourself, use this command:

```
claude plugin validate <path to this repository>
```

## Develop

Use these commands to do a check of burnline and to do the tests:

```
claude plugin validate .
claude plugin test .
```

The code is in one file: [`hooks/register.ts`](hooks/register.ts).

## License

[MIT](LICENSE)
