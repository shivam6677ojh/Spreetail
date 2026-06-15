import { createImport, getImportReport, listImports, deleteImport } from "./import.service.js";

export async function create(request, response) {
  const { groupId } = request.params;
  const { csvText, fileName } = request.body;

  if (!csvText) {
    return response.status(400).json({
      error: { message: "csvText field is required in request body" },
    });
  }

  const report = await createImport(groupId, request.auth.userId, csvText, fileName || "expenses_export.csv");

  response.status(201).json({
    status: "success",
    data: { report },
  });
}

export async function list(request, response) {
  const { groupId } = request.params;
  const imports = await listImports(groupId, request.auth.userId);

  response.status(200).json({
    status: "success",
    data: { imports },
  });
}

export async function report(request, response) {
  const { groupId, importId } = request.params;
  const report = await getImportReport(groupId, importId, request.auth.userId);

  response.status(200).json({
    status: "success",
    data: { report },
  });
}

export async function remove(request, response) {
  const { groupId, importId } = request.params;
  const result = await deleteImport(groupId, importId, request.auth.userId);

  response.status(200).json({
    status: "success",
    data: result,
  });
}
