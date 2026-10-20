/** Values that can cross the JSON protocol boundary. Missing is never serialized. */
export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | JsonValue[] | JsonObject;
export interface JsonObject {
  [key: string]: JsonValue;
}
/** Embedded JSON Schema 2020-12. The generated protocol schema references its standard meta-schema. */
export type JsonSchema = boolean | JsonObject;
/** A message is presentation only; it never changes validation eligibility. */
export type MessageSpec = { text: string } | { key: string };
/** Digest of immutable content, including the algorithm identifier.
 * @pattern ^sha256:[a-f0-9]{64}$
 */
export type ContentDigest = `sha256:${string}`;
export interface ArtifactIdentity {
  id: string;
  platform: string;
  digest: ContentDigest;
}
