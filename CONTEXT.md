# ZenMux in Pi

Names for the list ZenMux publishes and the chat models a person can select in Pi.

## Language

**Catalog**:
ZenMux's published list of models currently available through this provider. Pi keeps the last catalog it successfully read.
_Avoid_: model list, model store

**Catalog entry**:
One model as published in the catalog, including call styles that cannot carry a chat conversation.
_Avoid_: endpoint, adapter, listing

**Model**:
A chat model a person can select in Pi and send a conversation to. A catalog entry becomes a model only when it offers a chat protocol.
_Avoid_: catalog entry, slug

**Model id**:
The stable identity shared by a catalog entry and the model it becomes. Entries with different ids are different models even when their display names match.
_Avoid_: slug, name

**Chat protocol**:
The conversation API a model speaks. A model speaks exactly one.
_Avoid_: adapter, endpoint
