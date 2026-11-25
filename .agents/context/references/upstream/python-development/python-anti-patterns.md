### Bare Exception Handling

```python
# BAD: Swallowing all exceptions
try:
    process()
except Exception:
    pass  # Silent failure - bugs hidden forever
```

**Fix:** Catch specific exceptions. Log or handle appropriately.

```python
# GOOD
try:
    process()
except ConnectionError as e:
    logger.warning("Connection failed, will retry", error=str(e))
    raise
except ValueError as e:
    logger.error("Invalid input", error=str(e))
    raise BadRequestError(str(e))
```

### Unclosed Resources

```python
# BAD: File never closed
def read_file(path):
    f = open(path)
    return f.read()  # What if this raises?
```

**Fix:** Use context managers.

```python
# GOOD
def read_file(path):
    with open(path) as f:
        return f.read()
```

### Blocking in Async

```python
# BAD: Blocks the entire event loop
async def fetch_data():
    time.sleep(1)  # Blocks everything!
    response = requests.get(url)  # Also blocks!
```

**Fix:** Use async-native libraries.

```python
# GOOD
async def fetch_data():
    await asyncio.sleep(1)
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
```

### Missing Type Hints

```python
# BAD: No types
def process(data):
    return data["value"] * 2
```

**Fix:** Annotate all public functions.

```python
# GOOD
def process(data: dict[str, int]) -> int:
    return data["value"] * 2
```
