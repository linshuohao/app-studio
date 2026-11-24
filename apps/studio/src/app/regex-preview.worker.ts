self.addEventListener('message', ({ data }: MessageEvent<{ pattern: string; sample: string }>) => {
  try {
    const matches = new RegExp(data.pattern, 'u').test(data.sample);
    self.postMessage(matches ? '匹配' : '不匹配');
  } catch {
    self.postMessage('正则语法有误，请检查括号、反斜杠或重复次数。');
  }
});
