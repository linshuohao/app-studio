from asyncio import CancelledError

import httpx


class CompilerEnvironmentUnavailable(RuntimeError):
    pass


def interruption_reason(error):
    if isinstance(error, BaseExceptionGroup):
        return interruption_reason(error.exceptions[0])
    if isinstance(error, CompilerEnvironmentUnavailable):
        return "本次执行所用的编译环境已不可用。请继续处理，使用当前环境重新检查。"
    if isinstance(error, TimeoutError):
        return "本轮执行超时，超时前的进度已保存。"
    if isinstance(error, (CancelledError, GeneratorExit)):
        return "执行已取消，取消前的进度已保存。"
    if isinstance(error, ValueError):
        return "服务返回的内容未通过格式检查。"
    status = (
        error.response.status_code
        if isinstance(error, httpx.HTTPStatusError)
        else getattr(error, "status_code", None)
    )
    if status == 429:
        return "上游服务请求达到限额，请稍后继续。"
    if status in (401, 403):
        return "上游服务拒绝访问，请检查服务配置。"
    if status in (408, 504) or "timeout" in type(error).__name__.lower():
        return "等待上游服务响应超时。"
    if isinstance(error, ConnectionError) or "connect" in type(error).__name__.lower():
        return "无法连接上游服务，请稍后继续。"
    if isinstance(error, httpx.HTTPStatusError):
        return f"上游服务返回 HTTP {status}。"
    return "处理这一步时发生服务异常。"
