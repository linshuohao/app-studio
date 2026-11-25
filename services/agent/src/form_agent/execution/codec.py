"""Turn-local journal. Only trusted application types may be restored from JSON."""

from dataclasses import fields, is_dataclass
from functools import cache
from typing import Any

from pydantic import BaseModel


@cache
def _types():
    from form_agent.agent import authoring_state, state
    from form_agent.business.form_authoring import contracts, requirements
    from form_agent.integrations import compiler

    # These prefixes are part of the stored journal format. Keep emitting them
    # so interrupted turns also remain readable by the previous service version.
    modules = (
        ("form_agent.contracts", contracts),
        ("form_agent.requirements", requirements),
        ("form_agent.turn_state", state),
        ("form_agent.create_form.state", authoring_state),
        ("form_agent.integrations.compiler", compiler),
    )
    return {
        prefix + "." + cls.__name__: cls
        for prefix, module in modules
        for cls in vars(module).values()
        if isinstance(cls, type)
        and cls.__module__ == module.__name__
        and (issubclass(cls, BaseModel) or is_dataclass(cls))
    }


@cache
def _type_tags():
    return {cls: tag for tag, cls in _types().items()}


def _tag_for(cls: type) -> str:
    return _type_tags().get(cls, cls.__module__ + "." + cls.__name__)


def pack(value: Any) -> Any:
    cls = type(value)
    if isinstance(value, BaseModel):
        return [_tag_for(cls), value.model_dump(mode="json")]
    if is_dataclass(value):
        return [
            _tag_for(cls),
            {f.name: pack(getattr(value, f.name)) for f in fields(value)},
        ]
    if isinstance(value, dict):
        return {k: pack(v) for k, v in value.items()}
    if isinstance(value, (list, tuple, set)):
        return [cls.__name__, [pack(v) for v in value]]
    return value


def unpack(value: Any) -> Any:
    if isinstance(value, dict):
        return {k: unpack(v) for k, v in value.items()}
    if not isinstance(value, list):
        return value
    tag, data = value
    if tag in ("list", "tuple", "set"):
        return {"list": list, "tuple": tuple, "set": set}[tag](unpack(v) for v in data)
    cls = _types()[tag]
    if issubclass(cls, BaseModel):
        return cls.model_validate(data)
    return cls(**{k: unpack(v) for k, v in data.items()})
