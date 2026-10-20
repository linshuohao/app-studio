---
id: L1-EXAMPLES
title: 完整示例与业务组合
type: protocol
status: active
layer: L1
modules:
- M02
- M04
tags: []
related:
  decisions: []
sources:
- SRC-L1
- SRC-VAL
navigation:
  group: 02 · L1 协议
  order: 37
last_reviewed: '2026-10-19'
reading_next: L1-RELEASE
---

# 完整示例与业务组合

> L1 架构与语义决策正文；正式类型、Schema 与发布验收状态见各节。

## 完整保险投保 FormDefinition 示例 {#sample}

> 状态：待固化

下面使用单一 Data Schema、逐项 Scope、内部/外部 Constraint、Reaction、PC 与移动端 Profile、Typed View Template、容器 Material 和 Host Event 拼出同一份表单。**示例为结构与语义验收草案**：需与最终 JSON Schema、各物料 Manifest、Pure Function Registry 对齐后才能称为可运行发布样例。

**完整示例 · Canonical 候选 · 保险投保表单**

```json
{
  "protocolVersion": "1.0",
  "id": "insurance-application-demo",
  "version": "1.0.0",
  "data": {
    "schema": {
      "type": "object",
      "additionalProperties": false,
      "required": [
        "applicant",
        "insureds"
      ],
      "properties": {
        "applicant": {
          "$ref": "#/$defs/Applicant"
        },
        "insureds": {
          "type": "array",
          "items": {
            "$ref": "#/$defs/Insured"
          },
          "minItems": 1,
          "maxItems": 5
        },
        "plan": {
          "type": "string",
          "enum": [
            "basic",
            "premium"
          ],
          "default": "basic"
        }
      },
      "$defs": {
        "Applicant": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1
            },
            "phone": {
              "type": "string"
            }
          },
          "required": [
            "name",
            "phone"
          ]
        },
        "Insured": {
          "type": "object",
          "properties": {
            "name": {
              "type": "string",
              "minLength": 1
            },
            "age": {
              "type": "integer"
            },
            "country": {
              "type": "string"
            },
            "city": {
              "type": [
                "string",
                "null"
              ]
            },
            "idNumber": {
              "type": "string"
            }
          },
          "required": [
            "name",
            "age",
            "idNumber"
          ]
        }
      }
    }
  },
  "constraints": [
    {
      "id": "age-min-18",
      "kind": "internal",
      "scope": {
        "from": {
          "source": "data",
          "path": "/insureds"
        },
        "as": "insured",
        "mode": "each"
      },
      "assert": {
        "op": "gte",
        "args": [
          {
            "ref": {
              "source": "data",
              "scope": "insured",
              "path": "/age"
            }
          },
          18
        ]
      },
      "issue": {
        "target": {
          "source": "data",
          "scope": "insured",
          "path": "/age"
        },
        "code": "MIN_AGE_18"
      }
    },
    {
      "id": "insured-eligibility",
      "kind": "external",
      "scope": {
        "from": {
          "source": "data",
          "path": "/insureds"
        },
        "as": "insured",
        "mode": "each"
      },
      "watch": [
        {
          "source": "data",
          "scope": "insured",
          "path": "/age"
        },
        {
          "source": "data",
          "scope": "insured",
          "path": "/idNumber"
        }
      ],
      "target": {
        "source": "data",
        "scope": "insured",
        "path": "/idNumber"
      },
      "requiredForSubmit": true
    }
  ],
  "reactions": [
    {
      "id": "clear-city-on-country-change",
      "scope": {
        "from": {
          "source": "data",
          "path": "/insureds"
        },
        "as": "insured",
        "mode": "each"
      },
      "watch": [
        {
          "source": "data",
          "scope": "insured",
          "path": "/country"
        }
      ],
      "then": [
        {
          "op": "set",
          "target": {
            "source": "data",
            "scope": "insured",
            "path": "/city"
          },
          "value": null
        }
      ]
    }
  ],
  "viewTemplates": {
    "insured-fields": {
      "params": {
        "insured": {
          "schemaRef": "#/$defs/Insured"
        }
      },
      "node": {
        "material": "stack",
        "slots": {
          "default": [
            {
              "material": "text-input",
              "props": {
                "label": "姓名"
              },
              "bindings": {
                "value": {
                  "source": "data",
                  "scope": "insured",
                  "path": "/name"
                }
              }
            },
            {
              "material": "number-input",
              "props": {
                "label": "年龄"
              },
              "bindings": {
                "value": {
                  "source": "data",
                  "scope": "insured",
                  "path": "/age"
                }
              }
            },
            {
              "material": "country-picker",
              "props": {
                "label": "国家"
              },
              "bindings": {
                "value": {
                  "source": "data",
                  "scope": "insured",
                  "path": "/country"
                }
              }
            },
            {
              "material": "city-picker",
              "props": {
                "label": "城市"
              },
              "bindings": {
                "value": {
                  "source": "data",
                  "scope": "insured",
                  "path": "/city"
                }
              }
            },
            {
              "material": "text-input",
              "props": {
                "label": "证件号码"
              },
              "bindings": {
                "value": {
                  "source": "data",
                  "scope": "insured",
                  "path": "/idNumber"
                }
              }
            }
          ]
        }
      }
    },
    "expanded-form": {
      "node": {
        "material": "stack",
        "slots": {
          "default": [
            {
              "material": "text-input",
              "props": {
                "label": "投保人姓名"
              },
              "bindings": {
                "value": {
                  "source": "data",
                  "path": "/applicant/name"
                }
              }
            },
            {
              "scope": {
                "from": {
                  "source": "data",
                  "path": "/insureds"
                },
                "as": "insured",
                "mode": "each"
              },
              "node": {
                "material": "section",
                "props": {
                  "title": "被保人资料"
                },
                "slots": {
                  "default": [
                    {
                      "$use": "insured-fields",
                      "with": {
                        "insured": {
                          "source": "data",
                          "scope": "insured",
                          "path": ""
                        }
                      }
                    },
                    {
                      "material": "button",
                      "props": {
                        "label": "移除被保人"
                      },
                      "on": {
                        "activate": {
                          "type": "form.command",
                          "command": {
                            "op": "array.remove",
                            "target": {
                              "source": "data",
                              "path": "/insureds"
                            },
                            "item": {
                              "$scope": "insured"
                            }
                          }
                        }
                      }
                    }
                  ]
                }
              }
            },
            {
              "material": "button",
              "props": {
                "label": "提交投保"
              },
              "on": {
                "activate": {
                  "type": "host.emit",
                  "event": "insurance.submitRequested"
                }
              }
            }
          ]
        }
      }
    },
    "compact-form": {
      "node": {
        "material": "stack",
        "slots": {
          "default": [
            {
              "material": "applicant-summary",
              "bindings": {
                "value": {
                  "source": "data",
                  "path": "/applicant"
                }
              }
            },
            {
              "scope": {
                "from": {
                  "source": "data",
                  "path": "/insureds"
                },
                "as": "insured",
                "mode": "each"
              },
              "node": {
                "material": "bottom-sheet-editor",
                "slots": {
                  "trigger": [
                    {
                      "material": "insured-summary",
                      "bindings": {
                        "value": {
                          "source": "data",
                          "scope": "insured",
                          "path": ""
                        }
                      }
                    }
                  ],
                  "content": [
                    {
                      "$use": "insured-fields",
                      "with": {
                        "insured": {
                          "source": "data",
                          "scope": "insured",
                          "path": ""
                        }
                      }
                    }
                  ]
                }
              }
            },
            {
              "material": "button",
              "props": {
                "label": "提交投保"
              },
              "on": {
                "activate": {
                  "type": "host.emit",
                  "event": "insurance.submitRequested"
                }
              }
            }
          ]
        }
      }
    }
  },
  "views": {
    "expanded": {
      "$use": "expanded-form"
    },
    "compact": {
      "$use": "compact-form"
    }
  },
  "metadata": {
    "description": "L1 架构验收示例；未作为 JSON Schema 正式验收样本发布"
  }
}
```

## 业务组合验收：哪些场景由谁完成？ {#walkthrough}

> 状态：已收敛

| 业务操作 | 协议元素 | 应维持的不变量 |
| --- | --- | --- |
| PC 展开编辑多被保人 | ScopeNode each + insured-fields Template | 每项独立上下文，数据仍是一份 |
| 移动端点摘要卡片打开底部弹层 | bottom-sheet-editor Material + Slots | 不使用 view.present；不复制被保人对象 |
| 国家变化，清空当前城市 | Reaction watch → set | 没有 UI 时也生效，使用当前项 Scope |
| 每位被保人独立承保资格校验 | External Constraint each | 结果按实例与版本匹配，Pending 阻断 Readiness |
| 按当前项删除被保人 | ArrayRemove + ScopeHandle | 排序后不能删错项 |
| 提交 | host.emit + Host Readiness API | Definition 不直接访问 HTTP 接口 |

> **示例采用的前置能力**
> 
> 物料如 `bottom-sheet-editor`、`insured-summary`、`country-picker` 只是已注册 Manifest 的假设名称；`gte` 等 Pure Function 也须在 Pure Function Contract 中存在。示例不能替代注册表本身。

## 用极简表单检验协议使用成本 {#simple}

> 状态：已收敛

**普通表单不应被迫引入 Scope / Template / Reaction**

```json
{
  "protocolVersion": "1.0",
  "id": "profile-basic",
  "version": "1.0.0",
  "data": {
    "schema": {
      "type": "object",
      "properties": {
        "name": {
          "type": "string"
        }
      },
      "required": [
        "name"
      ]
    }
  },
  "views": {
    "default": {
      "material": "text-input",
      "props": {
        "placeholder": "请输入姓名"
      },
      "bindings": {
        "value": {
          "source": "data",
          "path": "/name"
        }
      }
    }
  }
}
```

判断抽象是否过度，不是数协议一共有多少概念，而是看使用一个普通场景时，是否被迫学习不相关的概念。复杂能力应该按需出现，不强制每张表单携带完整模板系统。
