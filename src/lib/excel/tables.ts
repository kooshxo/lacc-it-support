export const tableNames = {
  employees: "tblEmployees",
  tickets: "tblTickets",
  messages: "tblTicketMessages",
  events: "tblTicketEvents",
  attachments: "tblAttachments",
  categories: "tblCategories",
  departments: "tblDepartments",
  locations: "tblLocations",
  settings: "tblSettings",
} as const;

export const requiredTables = Object.values(tableNames);

export const columns = {
  employees: ["EmployeeUID", "Email", "DisplayName", "DepartmentUID", "LocationUID", "Role", "Active"],
  tickets: ["TicketUID", "TicketNumber", "OperationUID", "RequesterUID", "RequesterEmail", "RequesterName", "Subject", "Description", "Category", "Priority", "Status", "AssigneeUID", "DepartmentUID", "LocationUID", "AssetUID", "Impact", "WorkBlocked", "WorkaroundAvailable", "CreatedAt", "UpdatedAt", "ResolvedAt", "Version"],
  messages: ["MessageUID", "OperationUID", "TicketUID", "AuthorUID", "AuthorName", "Type", "Body", "CreatedAt"],
  events: ["EventUID", "OperationUID", "TicketUID", "ActorUID", "EventType", "Field", "OldValue", "NewValue", "CreatedAt"],
  attachments: ["AttachmentUID", "OperationUID", "TicketUID", "Filename", "StorageReference", "MimeType", "Size", "UploadedBy", "UploadedAt"],
} as const;
