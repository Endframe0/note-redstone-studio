"""Version-independent user preferences, deliberately outside the portable bundle."""
import json
import os
import tempfile
from pathlib import Path


def settings_path():
    return Path(os.environ.get('NBS_SETTINGS_DIR') or
                str(Path(os.environ.get('APPDATA', str(Path.home()))) / 'NbsRedstoneConverter')) / 'settings.json'


def read_settings(path):
    try:
        value = json.loads(path.read_text(encoding='utf-8'))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def write_settings(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, name = tempfile.mkstemp(prefix='settings-', suffix='.tmp', dir=path.parent)
    try:
        with os.fdopen(fd, 'w', encoding='utf-8') as stream:
            json.dump(value, stream, ensure_ascii=False, indent=2)
        os.replace(name, path)
    finally:
        Path(name).unlink(missing_ok=True)
