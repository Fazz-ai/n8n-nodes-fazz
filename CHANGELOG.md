# Changelog

## 0.1.3

- Fazz node: with On Error › Continue (using error output), a refused call now leaves through the error output. It used to come out of the success output.

## 0.1.2

- Contact > Get Many: 'Search' moved into the 'Filters' collection. Workflows that used it need the search set again under Filters.
- Fazz Trigger: the public address notice left the node; the README covers it, and activation explains it if Fazz can't reach n8n.

## 0.1.1

- Package author is now Fazz (contato@fazz.ia.br).

## 0.1.0

- Fazz node: send templates, text and media; create, update, find and list contacts; add notes.
- Fazz Trigger: starts a workflow on any Fazz event, with the webhook created and removed by the node and every delivery signature-checked.
