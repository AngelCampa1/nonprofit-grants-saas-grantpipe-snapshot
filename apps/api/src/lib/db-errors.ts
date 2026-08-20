export function isMissingColumnError(error: unknown, columnName: string) {
  const record = error as {
    code?: unknown;
    message?: unknown;
    cause?: { code?: unknown; message?: unknown };
  };

  return (
    (record.code === "42703" &&
      typeof record.message === "string" &&
      isUndefinedColumnMessage(record.message, columnName)) ||
    (record.cause?.code === "42703" &&
      typeof record.cause.message === "string" &&
      isUndefinedColumnMessage(record.cause.message, columnName))
  );
}

function isUndefinedColumnMessage(message: string, columnName: string) {
  return message.includes(`column "${columnName}" does not exist`);
}
