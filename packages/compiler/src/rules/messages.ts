import type { SchemaMessageOverride } from '@form-engine/protocol/definition';
import { ExpressionAnalyzer } from '../analysis/expression/analyze.js';
import { own, record } from '../common/object.js';
import { at } from '../common/pointer.js';

/** 消息只覆盖现有 Schema 关键字的展示，不生成新的校验规则或依赖。 */
export function checkMessages(
  messages: SchemaMessageOverride[],
  expressions: ExpressionAnalyzer,
): void {
  for (const [index, message] of messages.entries()) {
    const pointer = at('/validationMessages', index);
    const node = expressions.models.schemaReference(
      message.schemaRef,
      expressions.source(at(pointer, 'schemaRef')),
    );
    if (node && (!record(node.schema) || !own(node.schema, message.keyword)))
      expressions.diagnostics.error(
        'VALIDATION_MESSAGE_KEYWORD_NOT_FOUND',
        expressions.source(at(pointer, 'keyword')),
        `Schema ${message.schemaRef} has no keyword ${message.keyword}.`,
      );
  }
}
