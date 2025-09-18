# LocalUI

LocalUI is a tiny PHP web interface that renders controls defined in JSON and safely executes whitelisted shell commands on your machine. It is intended for localhost use with the built-in PHP server.

## Requirements
- PHP 8.1 or newer with `proc_open` enabled
- Web browser with JavaScript enabled

## Setup
1. Clone this repository or download the sources.
2. Copy the sample UI configuration to `config/ui.json` and adjust to your needs:
   ```sh
   cp config/ui.sample.json config/ui.json
   ```
3. Update the whitelist and element command templates in `config/ui.json` to match the binaries you intend to run.

## Running the web server
```sh
php -S localhost:8000 -t public
```
Then open [http://localhost:8000](http://localhost:8000) in your browser.

## API endpoints
- `POST /api/run` — Trigger a command. Payload example: `{ "id": "envOut", "commandId": "printEnv", "args": { "value": "optional" } }`
- `GET /api/read?id=envOut` — Read the most recently stored result for the given element or command.

Responses include:
```json
{
  "ok": true,
  "commandId": "printEnv",
  "id": "envOut",
  "result": {
    "ok": true,
    "code": 0,
    "stdout": "...",
    "stderr": "",
    "ts": "2024-01-01T12:00:00+00:00"
  }
}
```

## Configuration schema
Create `config/ui.json` following the structure below. Each element describes a control rendered by the UI. Commands with `${value}` placeholders are substituted with runtime values and executed only if the binary is present in the whitelist.

```json
{
  "globals": {
    "theme": {
      "palette": { "primary": "#111827", "accent": "#10B981" },
      "font": "'JetBrainsMono Nerd Font', 'JetBrains Mono', 'Fira Code', ui-monospace, 'SFMono-Regular', Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New', monospace",
      "margins": 12,
      "gap": 8,
      "layout": "grid"
    },
    "defaults": { "w": 12, "h": 2, "classes": "" }
  },
  "elements": [
    {
      "id": "btnCat",
      "type": "button",
      "label": "View /etc/hosts",
      "sound": "click.mp3",
      "command": { "server": { "id": "catHosts", "template": "cat /etc/hosts" } },
      "tooltip": "Show hosts file",
      "w": 6
    },
    {
      "id": "mute",
      "type": "toggle",
      "label": "Mute",
      "onCommand": { "server": { "id": "mute", "template": "pactl set-sink-mute @DEFAULT_SINK@ 1" } },
      "offCommand": { "server": { "id": "unmute", "template": "pactl set-sink-mute @DEFAULT_SINK@ 0" } },
      "initial": false
    },
    {
      "id": "stepVol",
      "type": "stepper",
      "label": "Volume",
      "min": 0,
      "max": 150,
      "step": 5,
      "value": 50,
      "command": { "server": { "id": "setVol", "template": "pactl set-sink-volume @DEFAULT_SINK@ ${value}%" } }
    },
    {
      "id": "inpFile",
      "type": "input",
      "label": "File path",
      "inputType": "string",
      "apply": { "label": "Apply", "command": { "server": { "id": "catFile", "template": "cat ${value}" } } }
    },
    {
      "id": "envOut",
      "type": "output",
      "label": "Environment",
      "command": { "server": { "id": "printEnv", "template": "env" } },
      "mode": "poll",
      "intervalMs": 3000,
      "w": 12,
      "h": 6
    },
    {
      "id": "fastfetch",
      "type": "output",
      "label": "Fastfetch",
      "command": { "server": { "id": "fastfetch", "template": "fastfetch --logo none" } },
      "mode": "manual",
      "onDemandButtonLabel": "Refresh"
    }
  ],
  "whitelist": ["cat", "env", "fastfetch", "pactl"]
}
```

### Interaction sounds

- Add an optional `sound` property to an element to play audio when the user interacts with it. For example: `"sound": "click.mp3"`.
- Audio files are loaded from `public/sound/`. Place your own media there, such as `click.mp3` or `error.mp3`.
- To differentiate between normal interactions and errors, you can provide an object: `"sound": { "interaction": "click.mp3", "error": "error.mp3" }`.

## Notes
- Only binaries listed in `whitelist` are executed. The server resolves binaries via the `PATH` environment.
- Arguments with forbidden shell metacharacters are rejected before execution.
- Command results are cached in `data/*.json` so they can be retrieved via `GET /api/read`.
- The UI polls output widgets automatically when `mode` is set to `"poll"`.
