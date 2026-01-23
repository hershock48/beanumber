# Workflow Name

> Copy this template to create new workflows.

## Objective

Describe what this workflow accomplishes in 1-2 sentences.

## Inputs

| Input | Type | Required | Description |
|-------|------|----------|-------------|
| input1 | string | Yes | Description of input1 |
| input2 | number | No | Description of input2 |

## Prerequisites

- Any conditions that must be true before starting
- Required access or permissions
- Data that must already exist

## Steps

### 1. Step Name

**Description**: What this step does

**Tool**: `src/lib/tools/tool-name.ts`

**Input**:
```json
{
  "param1": "value from inputs",
  "param2": "computed value"
}
```

**Expected Output**:
```json
{
  "success": true,
  "data": {
    "result": "..."
  }
}
```

**On Failure**: What to do if this step fails

---

### 2. Next Step Name

**Description**: What this step does

**Tool**: `src/lib/tools/another-tool.ts`

**Input**: Use output from step 1...

---

## Outputs

| Output | Type | Description |
|--------|------|-------------|
| output1 | string | Description of output1 |
| output2 | boolean | Description of output2 |

## Error Handling

| Error | Cause | Resolution |
|-------|-------|------------|
| Error type 1 | Why it happens | What to do |
| Error type 2 | Why it happens | What to do |

## Notes

- Any additional context or gotchas
- Rate limits to be aware of
- Related workflows

## Changelog

| Date | Change | Author |
|------|--------|--------|
| YYYY-MM-DD | Created workflow | Name |
