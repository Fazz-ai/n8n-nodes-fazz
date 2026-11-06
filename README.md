# @fazz-ai/n8n-nodes-fazz

The official [n8n](https://n8n.io/) nodes for [Fazz](https://fazz.ia.br), the WhatsApp CRM. Send approved WhatsApp templates, text and media, keep contacts up to date, and start workflows when something happens in Fazz: a message received, a contact created, a deal won.

- [Installation](#installation)
- [Credentials](#credentials)
- [Fazz node](#fazz-node)
- [Fazz Trigger](#fazz-trigger)
- [Example workflows](#example-workflows)
- [Compatibility](#compatibility)
- [Resources](#resources)

## Installation

In n8n, open **Settings › Community Nodes**, select **Install**, and enter `@fazz-ai/n8n-nodes-fazz`. See the [community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) for self-hosted setups.

## Credentials

The nodes use a Fazz **server connection** key.

1. In Fazz, a team owner or admin opens **Settings › Integrations › Server API** and creates a connection.
2. Copy the key (`fz_live_…`). It is shown only once.
3. In n8n, create a **Fazz API** credential and paste the key.
4. Leave **Base URL** as `https://app.fazz.ia.br`, unless your company opens Fazz at its own domain: then use that address.

n8n checks the credential by calling `GET /api/v1/me`.

Every call acts on the connection's team. While the connection is in **test mode**, only the numbers on its test list receive messages.

## Fazz node

| Resource | Operation | What it does |
| --- | --- | --- |
| Message | Send Template | Sends an approved WhatsApp template, at any time, to a phone or a contact. Supports body and header variables (in order, or by name for named templates), a media header by URL, button values, the department and member who take the conversation, and the company the message is about. |
| Message | Send Text | Sends free text while the 24-hour window is open, to a phone or a conversation. |
| Message | Send Media | Sends an image, video, audio or document by public `https` URL while the window is open. |
| Contact | Create | Creates a contact with its lead source. |
| Contact | Create or Update | Creates the contact that has this phone, or updates it. |
| Contact | Update | Fills empty fields, or overwrites them when **Overwrite Existing Values** is on. |
| Contact | Find | Finds the contact that has a phone or an email. Returns no item when there is none. |
| Contact | Get Many | Lists contacts, newest first, optionally filtered by name, email or phone. |
| Contact | Add Note | Adds an internal note, visible only to the team. |

WhatsApp numbers, templates, members, departments, lead sources and contacts are picked from lists loaded from your Fazz team.

### Sending only once

Every send carries an idempotency key. By default it is made of the execution, the node, the run and the item, so when n8n retries a node the message is not sent twice. To protect across executions too (a workflow re-run by hand, for instance), set **Options › Idempotency Key** to something that identifies the message, such as `invoice-{{ $json.invoiceId }}`. The same key with the same message returns the first answer; the same key with a different message is refused with `duplicate_send`.

### When Fazz refuses

A refusal becomes an n8n error with the API message and its stable code in brackets, for example `[window_closed]`, plus how to solve it. With **On Error › Continue**, the item comes out as `{ "error": "…", "code": "window_closed" }`, so the next node can branch on `code`. With **On Error › Continue (using error output)**, it leaves through the node's error output instead. The codes are listed in the [API reference](https://app.fazz.ia.br/docs/api/reference).

## Fazz Trigger

Choose the events that start the workflow. When the workflow is activated, the node creates a webhook in Fazz pointing to n8n; when it is deactivated, the node deletes it. Changing the events replaces the webhook.

Every delivery is signed (`X-Fazz-Signature`, HMAC-SHA256 with a timestamp). The node checks the signature with the webhook secret and refuses anything that does not match, or that is more than 5 minutes old, with `401`. The **Send test** button in Fazz is acknowledged without starting the workflow.

The workflow receives the event envelope:

```json
{
  "id": "01JBX6Q0X4Y9K8Z2M3N4P5Q6R7",
  "event": "message.received",
  "api_version": "2026-11-01",
  "occurred_at": "2026-11-05T09:02:25-03:00",
  "team": { "id": 1, "name": "Acme" },
  "data": { "message_id": 120, "conversation_id": 45, "text": "Hi!" }
}
```

`id` is stable across retries: use it to ignore a repeated delivery. The `data` of each event is documented in the [API reference](https://app.fazz.ia.br/docs/api/reference).

### n8n must be reachable from the internet

Fazz only calls public `https` addresses on the default port. If n8n runs on your computer or on a private network, activating the trigger fails with an explanation: set n8n's `WEBHOOK_URL` to a public `https` address (a tunnel works) and activate again. n8n Cloud works as is.

## Example workflows

Ready-to-import templates, tested on n8n 2.46.6, are in [`templates/`](templates/). Each one explains its setup in sticky notes on the canvas.

| Template | What it does |
| --- | --- |
| [Lead intake](templates/lead-intake.json) | An n8n form creates or updates the contact in Fazz, greets new leads with an approved template and notes their interest. |
| [Appointment reminders](templates/appointment-reminders.json) | Every hour, sends a reminder template for appointments in the next 24 hours from an n8n data table and records the result per row. |
| [Message triage](templates/message-triage.json) | Classifies each incoming message with AI, notes sales and support intent on the contact, and emails the team about complaints. |

Other ideas:

- **Invoice reminder**: a billing system calls an n8n Webhook → **Fazz › Send Template** with the invoice template, the customer phone, the amount as a variable and the PDF as a document header, with **Idempotency Key** `invoice-{{ $json.id }}`.
- **New lead to CRM**: **Fazz Trigger** on `contact.created` → your CRM node, creating the lead with the contact's name, phone and source.
- **Customer reply alert**: **Fazz Trigger** on `message.received` → Slack, posting the contact name and the text.

## Compatibility

Tested with n8n 2.46.

## Resources

- [Fazz API reference](https://app.fazz.ia.br/docs/api/reference)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## License

[MIT](LICENSE)
