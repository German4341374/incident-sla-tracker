# API and business rules

## Endpoints

| Method   | Path                 | Purpose                                     |
| -------- | -------------------- | ------------------------------------------- |
| `POST`   | `/api/incidents`     | Create an incident and calculate its SLA    |
| `GET`    | `/api/incidents`     | Search, filter and paginate incidents       |
| `GET`    | `/api/incidents/:id` | Read an incident and its status history     |
| `PATCH`  | `/api/incidents/:id` | Update fields and record status transitions |
| `DELETE` | `/api/incidents/:id` | Delete an incident and cascading history    |
| `GET`    | `/api/dashboard`     | Read workload and resolution metrics        |
| `GET`    | `/health`            | Check process and database readiness        |
| `GET`    | `/docs`              | Open Swagger UI                             |

## SLA rules

Deadlines are calculated from `createdAt`. If priority changes, the deadline is recalculated from
the original creation timestamp. Only Open and In Progress incidents can be overdue. Moving an
incident to Resolved or Closed sets `resolvedAt`; reopening it clears that value.

Status transitions are inserted in the same database transaction as the incident update.

## List query parameters

- `status`: `OPEN`, `IN_PROGRESS`, `RESOLVED`, or `CLOSED`
- `priority`: `LOW`, `MEDIUM`, `HIGH`, or `CRITICAL`
- `assignee`: case-insensitive exact match
- `search`: case-insensitive title or description match
- `page`: positive integer, default `1`
- `limit`: `1` through `100`, default `20`
