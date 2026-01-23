# Workflows

Workflows are Markdown Standard Operating Procedures (SOPs) that define processes in plain language. They guide the agent on what to do, not how to code it.

## Directory Structure

```
workflows/
├── admin/        # Administrative workflows (digest, reconciliation)
├── children/     # Child update intake and publishing
├── compliance/   # Reminder and escalation automation
├── donation/     # Donation processing workflows
├── email/        # Email notification workflows
├── health/       # Site health monitoring
├── sponsor/      # Sponsor-related workflows
└── README.md     # This file
```

## Workflow Categories

| Category | Purpose | Key Workflows |
|----------|---------|---------------|
| **admin** | Staff operations | Review updates, daily digest, reconciliation |
| **children** | Child updates | Field intake, academic intake, verification |
| **compliance** | Automation | Reminders, escalation |
| **donation** | Payments | Recurring processing |
| **email** | Notifications | Sponsor welcome, update alerts |
| **health** | Monitoring | Link checks |
| **sponsor** | Sponsor ops | Login verification, onboarding |

## Workflow Format

Each workflow should include:

1. **Objective**: What this workflow accomplishes
2. **Inputs**: What data is needed to start
3. **Steps**: Sequential actions to perform
4. **Tools**: Which tools from `src/lib/tools/` to use
5. **Outputs**: What the workflow produces
6. **Error Handling**: How to handle failures

## Example Workflow Structure

```markdown
# Workflow Name

## Objective
Brief description of what this workflow accomplishes.

## Inputs
- Input 1: Description
- Input 2: Description

## Steps
1. Step description
   - Tool: `tool-name`
   - Input: What to pass
   - Output: What to expect

2. Next step...

## Outputs
- Output 1: Description

## Error Handling
- Error scenario: How to handle
```

## Creating New Workflows

1. Create a new `.md` file in the appropriate subdirectory
2. Follow the workflow format above
3. Reference only existing tools from `src/lib/tools/`
4. Document edge cases and error handling
5. Test with sample data before use

## Key Principles

- **Plain language**: Write like you're briefing a team member
- **Deterministic execution**: Tools do the work, agent orchestrates
- **Error recovery**: Document how to handle failures
- **Continuous improvement**: Update workflows as you learn
