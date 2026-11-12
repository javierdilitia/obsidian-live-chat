"""The only error type in the data contract."""

from typing import Literal

NotFoundKind = Literal["product", "order", "category"]


class NotFoundError(Exception):
    """Raised when one or more requested ids do not exist.

    `ids` lists exactly the missing ids, in the order they were requested.
    """

    def __init__(self, kind: NotFoundKind, ids: list[str]) -> None:
        self.kind: NotFoundKind = kind
        self.ids: list[str] = list(ids)
        super().__init__(f"{kind} not found: {', '.join(self.ids)}")
