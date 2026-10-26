# Examples

Every run shown on [modelsalt.com](https://modelsalt.com): the same prompt sent to each model again and again, plain and with Model Salt 1.0.0.

`runs.json` lists them, one entry per run:

| Field | What it is |
|---|---|
| `prompt` | the prompt, word for word |
| `model` | the model that answered |
| `arm` | `plain` (the prompt as is, no tool) or `model-salt` |
| `setting` | the randomness setting, 0 to 2 (`null` for plain) |
| `run` | the run number in its set |
| `kind` | `svg` (a drawing), `icon` (an app icon), `html` (a web page) or `text` |
| `file` | the answer as a file: `pictures/` for drawings and icons (SVG, or WebP where the model used an image tool), `pages/` for web pages |
| `text` | the answer, for text prompts |
| `settled` | what Model Salt settled for that run, where it was recorded |

| Prompt | Runs |
|---|---|
| Generate an SVG of a pelican riding a bicycle. | 360 |
| Design a landing page for a new meal-planning app, as one self-contained HTML file. | 120 |
| Design an app icon for a new weather app, square, no round borders. | 120 |
| Suggest a name for a neighbourhood coffee shop. | 120 |
| Come up with a name and a one-line pitch for a new casual mobile puzzle game. | 120 |
| Write a haiku about autumn. | 120 |
| Write the first line of a short story about a lighthouse keeper. | 120 |

The answers are the models' own, unedited. Licence: CC BY 4.0 ([LICENSE](LICENSE)). Use them for anything, with the credit "Model Salt" and a link to modelsalt.com where you can.
