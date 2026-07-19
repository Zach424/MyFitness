const unsafeCompactPatterns = [
  /诊断|治疗|治愈|处方|患者|疾病|病症/u,
  /保证|必须|惩罚|燃脂|快速减重|快速瘦身|补剂|保健品/u,
  /热量缺口|热量目标|控制热量|能量处方|卡路里|千卡|kcal/iu,
  /\d+(?:kg|公斤|斤|克蛋白|克蛋白质|g蛋白|g蛋白质)|蛋白(?:质)?\d+(?:克|g)/iu,
  /bmi/iu,
  /diagnos|treat(?:ment)?|prescri(?:be|ption)|cure|patient|disease/iu,
  /guarantee|punish|rapidweightloss|calor(?:ie|ies)|macrotarget|supplement/iu,
  /忽略(?:之前|先前|以上|所有|系统|开发者|原有)*(?:指令|规则|提示)|系统提示(?:词)?|开发者消息/u,
  /ignore(?:all|previous|prior|system)*instructions?|systemprompt|developermessage/iu,
]

const stripFormatCharacters = (value: string) =>
  value
    .normalize('NFKC')
    .replace(/\p{Cf}/gu, '')
    .toLowerCase()

const compactForPolicyMatch = (value: string) =>
  stripFormatCharacters(value).replace(/[\p{White_Space}\p{P}\p{S}]+/gu, '')

export const normalizeAiNumericText = (value: string) =>
  stripFormatCharacters(value).replace(/(?<=\d)[\p{White_Space},，_](?=\d)/gu, '')

export const containsUnsafeAiCopy = (value: string) => {
  const compact = compactForPolicyMatch(value)
  return unsafeCompactPatterns.some((pattern) => pattern.test(compact))
}
