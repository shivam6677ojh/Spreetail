import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { apiClient } from "../api/client";

export function GroupDetailPage() {
  const { groupId } = useParams();

  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState("overview");

  // Authentication info
  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  // Core Data States
  const [balancesData, setBalancesData] = useState(null);
  const [expenses, setExpenses] = useState([]);
  const [expensesPagination, setExpensesPagination] = useState({ page: 1, pageSize: 10, total: 0 });
  const [settlements, setSettlements] = useState([]);
  const [members, setMembers] = useState([]);
  const [imports, setImports] = useState([]);

  // Multi-currency UI states and helpers
  const [activeCurrency, setActiveCurrency] = useState("USD");
  const [expCurrency, setExpCurrency] = useState("USD");
  const [settleCurrency, setSettleCurrency] = useState("USD");

  const formatCurrency = (amount, currencyCode) => {
    const symbol = currencyCode === "INR" ? "₹" : "$";
    return `${symbol}${parseFloat(amount || 0).toFixed(2)}`;
  };

  const currentBalances = balancesData?.[activeCurrency] || {
    balances: {},
    summary: { totalSpending: "0.0000", members: [] },
    transfers: []
  };

  // Fetch functions
  const fetchGroupDetails = async () => {
    try {
      const res = await apiClient.get(`/groups`);
      // Find this specific group
      const current = res.data.data.groups.find(g => g.id === groupId);
      if (!current) {
        throw new Error("Group not found");
      }
      setGroup(current);
      setMembers(current.members || []);
    } catch (err) {
      console.error(err);
      setError("Failed to load group details.");
    }
  };

  const fetchBalances = async () => {
    try {
      const res = await apiClient.get(`/groups/${groupId}/balances`);
      setBalancesData(res.data.data);
    } catch (err) {
      console.error("Balances fail:", err);
    }
  };

  const fetchExpenses = async (page = 1) => {
    try {
      const res = await apiClient.get(`/groups/${groupId}/expenses?page=${page}&pageSize=10`);
      setExpenses(res.data.data.expenses);
      setExpensesPagination(res.data.data.pagination);
    } catch (err) {
      console.error("Expenses fail:", err);
    }
  };

  const fetchSettlements = async () => {
    try {
      const res = await apiClient.get(`/groups/${groupId}/settlements`);
      setSettlements(res.data.data.settlements);
    } catch (err) {
      console.error("Settlements fail:", err);
    }
  };

  const fetchImports = async () => {
    try {
      const res = await apiClient.get(`/groups/${groupId}/imports`);
      setImports(res.data.data.imports);
    } catch (err) {
      console.error("Imports fail:", err);
    }
  };

  const reloadAllData = async () => {
    setLoading(true);
    await Promise.all([
      fetchGroupDetails(),
      fetchBalances(),
      fetchExpenses(expensesPagination.page),
      fetchSettlements(),
      fetchImports()
    ]);
    setLoading(false);
  };

  useEffect(() => {
    reloadAllData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId]);

  // Modal & Form States
  // Expense Form
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [expenseIdToEdit, setExpenseIdToEdit] = useState(null);
  const [expDesc, setExpDesc] = useState("");
  const [expAmount, setExpAmount] = useState("");
  const [expPayerId, setExpPayerId] = useState("");
  const [expDate, setExpDate] = useState(new Date().toISOString().slice(0, 10));
  const [expSplitMethod, setExpSplitMethod] = useState("EQUAL");
  const [expParticipants, setExpParticipants] = useState({});
  const [expNotes, setExpNotes] = useState("");
  const [expenseFormError, setExpenseFormError] = useState(null);
  const [expenseFormLoading, setExpenseFormLoading] = useState(false);

  // Settlement Form
  const [showSettlementModal, setShowSettlementModal] = useState(false);
  const [settlePayerId, setSettlePayerId] = useState("");
  const [settleRecipientId, setSettleRecipientId] = useState("");
  const [settleAmount, setSettleAmount] = useState("");
  const [settleDate, setSettleDate] = useState(new Date().toISOString().slice(0, 10));
  const [settleNotes, setSettleNotes] = useState("");
  const [settlementFormError, setSettlementFormError] = useState(null);
  const [settlementFormLoading, setSettlementFormLoading] = useState(false);

  // Add Member Form
  const [showMemberModal, setShowMemberModal] = useState(false);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberJoinDate, setMemberJoinDate] = useState(new Date().toISOString().slice(0, 10));
  const [memberFormError, setMemberFormError] = useState(null);
  const [memberFormLoading, setMemberFormLoading] = useState(false);

  // Remove Member Form
  const [showRemoveMemberModal, setShowRemoveMemberModal] = useState(false);
  const [memberToRemove, setMemberToRemove] = useState(null);
  const [memberLeaveDate, setMemberLeaveDate] = useState(new Date().toISOString().slice(0, 10));
  const [removeMemberFormError, setRemoveMemberFormError] = useState(null);
  const [removeMemberFormLoading, setRemoveMemberFormLoading] = useState(false);

  // CSV Import Form
  const [showImportModal, setShowImportModal] = useState(false);
  const [csvFileContent, setCsvFileContent] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [importFormError, setImportFormError] = useState(null);
  const [importFormLoading, setImportFormLoading] = useState(false);

  // View Import Report Modal
  const [showReportModal, setShowReportModal] = useState(false);
  const [selectedReport, setSelectedReport] = useState(null);

  // Pre-fill helper for settle up
  const handleQuickSettle = (fromId, toId, amount) => {
    setSettlePayerId(fromId);
    setSettleRecipientId(toId);
    setSettleAmount(amount);
    setSettleDate(new Date().toISOString().slice(0, 10));
    setSettleNotes(`Settle debt to ${balancesData?.[activeCurrency]?.balances?.[toId]?.name || ""}`);
    setSettleCurrency(activeCurrency);
    setShowSettlementModal(true);
  };

  // Open Add Expense Form
  const openAddExpense = () => {
    setExpenseIdToEdit(null);
    setExpDesc("");
    setExpAmount("");
    setExpPayerId(currentUser.id);
    setExpDate(new Date().toISOString().slice(0, 10));
    setExpSplitMethod("EQUAL");
    setExpNotes("");
    setExpCurrency(activeCurrency);
    setExpenseFormError(null);
    
    // Default all active members as participants
    const active = members.filter(m => !m.leftAt).map(m => m.userId);
    const initialParticipants = {};
    for (const userId of active) {
      initialParticipants[userId] = { checked: true, val: "" };
    }
    setExpParticipants(initialParticipants);
    setShowExpenseModal(true);
  };

  // Open Edit Expense Form
  const openEditExpense = (exp) => {
    setExpenseIdToEdit(exp.id);
    setExpDesc(exp.description);
    setExpAmount(parseFloat(exp.amount).toString());
    setExpPayerId(exp.paidById);
    setExpDate(new Date(exp.expenseDate).toISOString().slice(0, 10));
    setExpSplitMethod(exp.splitMethod);
    setExpNotes(exp.notes || "");
    setExpCurrency(exp.currency || "USD");
    setExpenseFormError(null);

    const initialParticipants = {};
    // Map active members
    for (const m of members) {
      const matchingP = exp.participants.find(p => p.userId === m.userId);
      if (matchingP) {
        let val = "";
        if (exp.splitMethod === "EXACT") val = parseFloat(matchingP.amount).toString();
        else if (exp.splitMethod === "PERCENTAGE") {
          // Calculate percentage: (amount / expense.amount) * 100
          val = ((parseFloat(matchingP.amount) / parseFloat(exp.amount)) * 100).toFixed(2);
        } else if (exp.splitMethod === "CUSTOM") {
          val = parseFloat(matchingP.amount).toString(); // use weight
        }
        initialParticipants[m.userId] = { checked: true, val };
      } else {
        initialParticipants[m.userId] = { checked: false, val: "" };
      }
    }
    setExpParticipants(initialParticipants);
    setShowExpenseModal(true);
  };

  // Handle Submit Expense Form (Create or Edit)
  const handleExpenseSubmit = async (e) => {
    e.preventDefault();
    setExpenseFormError(null);
    setExpenseFormLoading(true);

    try {
      // Format participants data structure according to backend expectations
      const participantsArray = [];
      for (const uId in expParticipants) {
        const p = expParticipants[uId];
        if (p.checked) {
          const entry = { userId: uId };
          if (expSplitMethod === "EXACT") entry.amount = p.val;
          else if (expSplitMethod === "PERCENTAGE") entry.percentage = p.val;
          else if (expSplitMethod === "CUSTOM") entry.weight = p.val;
          participantsArray.push(entry);
        }
      }

      if (participantsArray.length === 0) {
        throw new Error("At least one participant must be selected");
      }

      const payload = {
        description: expDesc,
        amount: expAmount,
        paidById: expPayerId,
        expenseDate: expDate,
        splitMethod: expSplitMethod,
        participants: participantsArray,
        notes: expNotes || null,
        currency: expCurrency,
      };

      if (expenseIdToEdit) {
        await apiClient.patch(`/groups/${groupId}/expenses/${expenseIdToEdit}`, payload);
      } else {
        await apiClient.post(`/groups/${groupId}/expenses`, payload);
      }

      setShowExpenseModal(false);
      reloadAllData();
    } catch (err) {
      console.error(err);
      setExpenseFormError(err.response?.data?.error?.message || err.message || "Failed to save expense.");
    } finally {
      setExpenseFormLoading(false);
    }
  };

  // Handle Delete Expense
  const handleDeleteExpense = async (expId) => {
    if (!window.confirm("Are you sure you want to delete this expense?")) return;

    try {
      await apiClient.delete(`/groups/${groupId}/expenses/${expId}`);
      reloadAllData();
    } catch (err) {
      alert(err.response?.data?.error?.message || "Failed to delete expense.");
    }
  };

  // Handle Submit Settlement Form
  const handleSettlementSubmit = async (e) => {
    e.preventDefault();
    setSettlementFormError(null);
    setSettlementFormLoading(true);

    try {
      await apiClient.post(`/groups/${groupId}/settlements`, {
        paidById: settlePayerId,
        paidToId: settleRecipientId,
        amount: settleAmount,
        currency: settleCurrency,
        settledAt: new Date(settleDate).toISOString(),
        notes: settleNotes || null,
      });

      setShowSettlementModal(false);
      reloadAllData();
    } catch (err) {
      console.error(err);
      setSettlementFormError(err.response?.data?.error?.message || "Failed to record settlement.");
    } finally {
      setSettlementFormLoading(false);
    }
  };

  // Handle Submit Add Member Form
  const handleAddMemberSubmit = async (e) => {
    e.preventDefault();
    setMemberFormError(null);
    setMemberFormLoading(true);

    try {
      await apiClient.post(`/groups/${groupId}/members`, {
        email: memberEmail,
        joinedAt: new Date(memberJoinDate).toISOString(),
      });

      setMemberEmail("");
      setShowMemberModal(false);
      reloadAllData();
    } catch (err) {
      console.error(err);
      setMemberFormError(err.response?.data?.error?.message || "Failed to add member.");
    } finally {
      setMemberFormLoading(false);
    }
  };

  // Handle Submit Remove Member Form
  const handleRemoveMemberSubmit = async (e) => {
    e.preventDefault();
    setRemoveMemberFormError(null);
    setRemoveMemberFormLoading(true);

    try {
      await apiClient.delete(`/groups/${groupId}/members/${memberToRemove.userId}`, {
        data: {
          leftAt: new Date(memberLeaveDate).toISOString(),
        },
      });

      setShowRemoveMemberModal(false);
      setMemberToRemove(null);
      reloadAllData();
    } catch (err) {
      console.error(err);
      setRemoveMemberFormError(err.response?.data?.error?.message || "Failed to remove member.");
    } finally {
      setRemoveMemberFormLoading(false);
    }
  };

  // Handle CSV file selection & reading
  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setCsvFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      setCsvFileContent(evt.target.result);
    };
    reader.readAsText(file);
  };

  // Handle CSV Import Submit
  const handleImportSubmit = async (e) => {
    e.preventDefault();
    setImportFormError(null);
    setImportFormLoading(true);

    try {
      const res = await apiClient.post(`/groups/${groupId}/imports`, {
        csvText: csvFileContent,
        fileName: csvFileName,
      });

      setShowImportModal(false);
      setCsvFileContent("");
      setCsvFileName("");
      
      // Select report to show results automatically
      setSelectedReport(res.data.data.report);
      setShowReportModal(true);
      
      reloadAllData();
    } catch (err) {
      console.error(err);
      setImportFormError(err.response?.data?.error?.message || "Failed to import CSV file.");
    } finally {
      setImportFormLoading(false);
    }
  };

  // Open import report detail
  const openImportReport = async (impId) => {
    try {
      const res = await apiClient.get(`/groups/${groupId}/imports/${impId}`);
      setSelectedReport(res.data.data.report);
      setShowReportModal(true);
    } catch {
      alert("Failed to load import report details.");
    }
  };

  // Helper to download the import report as a PDF
  const downloadReportPDF = (report) => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      alert("Please allow popups to download the PDF report.");
      return;
    }

    const escapeHtml = (str) => {
      if (!str) return "";
      return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
    };

    const formatDate = (dateStr) => {
      if (!dateStr) return new Date().toLocaleDateString();
      const d = new Date(dateStr);
      return isNaN(d.getTime()) ? dateStr : d.toLocaleDateString();
    };

    const statusMap = {
      COMPLETED: { text: "Completed", class: "status-completed" },
      COMPLETED_WITH_ANOMALIES: { text: "Completed with Anomalies", class: "status-completed_with_anomalies" },
      FAILED: { text: "Failed", class: "status-failed" }
    };
    const currentStatus = statusMap[report.status] || { text: report.status, class: "status-failed" };

    const anomaliesHtml = report.anomalies && report.anomalies.length > 0
      ? report.anomalies.map((anom) => {
          let rawDataStr = "";
          if (anom.rawData) {
            rawDataStr = typeof anom.rawData === "object"
              ? JSON.stringify(anom.rawData, null, 2)
              : String(anom.rawData);
          }
          const rawDataBox = rawDataStr
            ? `<div class="raw-data-box">${escapeHtml(rawDataStr)}</div>`
            : "";
          const severityClass = anom.severity === "ERROR" ? "severity-error" : "severity-warning";
          return `
            <tr>
              <td class="row-num" style="width: 80px; text-align: center;">Row ${anom.rowNumber || "N/A"}</td>
              <td style="width: 100px; text-align: center;">
                <span class="severity-badge ${severityClass}">${escapeHtml(anom.severity)}</span>
              </td>
              <td>
                <div class="anomaly-code">${escapeHtml(anom.code)}</div>
                <div class="anomaly-msg">${escapeHtml(anom.message)}</div>
                ${rawDataBox}
              </td>
            </tr>
          `;
        }).join("")
      : `<tr><td colspan="3" style="text-align: center; color: #64748b; padding: 24px;">No anomalies detected. Clean import!</td></tr>`;

    const docContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>CSV Import Audit Report - ${escapeHtml(report.fileName)}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600;700&family=Inter:wght@400;500;600;700&family=Fira+Code:wght@400;500&display=swap" rel="stylesheet">
  <style>
    body {
      font-family: 'Inter', sans-serif;
      color: #1e293b;
      margin: 0;
      padding: 40px;
      line-height: 1.5;
      background-color: #ffffff;
    }
    h1, h2, h3, h4 {
      font-family: 'Outfit', sans-serif;
      margin: 0;
    }
    .header-container {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #e2e8f0;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    .logo-area {
      font-family: 'Outfit', sans-serif;
      font-size: 24px;
      font-weight: 700;
      color: #0f172a;
    }
    .logo-area span {
      color: #4f46e5;
    }
    .report-title {
      font-size: 20px;
      font-weight: 600;
      color: #475569;
      margin-top: 5px;
    }
    .meta-item {
      font-size: 13px;
      color: #64748b;
      margin-top: 4px;
    }
    .status-badge {
      display: inline-block;
      padding: 6px 12px;
      border-radius: 8px;
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .status-completed {
      background-color: #ecfdf5;
      color: #047857;
      border: 1px solid #a7f3d0;
    }
    .status-completed_with_anomalies {
      background-color: #fffbeb;
      color: #b45309;
      border: 1px solid #fde68a;
    }
    .status-failed {
      background-color: #fef2f2;
      color: #b91c1c;
      border: 1px solid #fecaca;
    }
    
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 20px;
      margin-bottom: 35px;
    }
    .stat-card {
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 12px;
      padding: 16px;
      text-align: center;
    }
    .stat-label {
      font-size: 11px;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
      color: #64748b;
      margin-bottom: 4px;
    }
    .stat-val {
      font-family: 'Outfit', sans-serif;
      font-size: 28px;
      font-weight: 700;
      color: #0f172a;
    }
    .stat-card.imported {
      background-color: #f0fdf4;
      border-color: #dcfce7;
    }
    .stat-card.imported .stat-val {
      color: #15803d;
    }
    .stat-card.anomalous {
      background-color: #fdf2f8;
      border-color: #fce7f3;
    }
    .stat-card.anomalous .stat-val {
      color: #be185d;
    }
    
    .section-title {
      font-size: 16px;
      font-weight: 700;
      color: #0f172a;
      margin-bottom: 15px;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 8px;
    }
    
    table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }
    th {
      background-color: #f1f5f9;
      font-weight: 600;
      text-align: left;
      font-size: 12px;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #475569;
      padding: 10px 12px;
      border-bottom: 2px solid #cbd5e1;
    }
    td {
      padding: 12px;
      font-size: 13px;
      border-bottom: 1px solid #e2e8f0;
      vertical-align: top;
    }
    tr {
      page-break-inside: avoid;
    }
    .row-num {
      font-weight: 600;
      color: #64748b;
    }
    .severity-badge {
      display: inline-block;
      padding: 2px 6px;
      border-radius: 4px;
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
    }
    .severity-error {
      background-color: #fee2e2;
      color: #991b1b;
      border: 1px solid #fca5a5;
    }
    .severity-warning {
      background-color: #fef3c7;
      color: #92400e;
      border: 1px solid #fcd34d;
    }
    .anomaly-code {
      font-weight: 700;
      color: #0f172a;
    }
    .anomaly-msg {
      color: #334155;
      margin-top: 2px;
    }
    .raw-data-box {
      font-family: 'Fira Code', monospace;
      font-size: 11px;
      background-color: #f8fafc;
      border: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 6px 10px;
      margin-top: 6px;
      white-space: pre-wrap;
      word-break: break-all;
      color: #475569;
    }
    
    .footer {
      text-align: center;
      font-size: 11px;
      color: #94a3b8;
      border-top: 1px solid #e2e8f0;
      padding-top: 20px;
      margin-top: 50px;
      page-break-inside: avoid;
    }
    
    @media print {
      body {
        padding: 20px;
      }
      .no-print {
        display: none;
      }
    }
  </style>
</head>
<body>
  <div class="header-container">
    <div>
      <div class="logo-area">Split<span>Wise</span> Shared Expenses</div>
      <div class="report-title">CSV Import Audit Report</div>
      <div class="meta-item"><strong>File Name:</strong> ${escapeHtml(report.fileName)}</div>
      <div class="meta-item"><strong>Generated On:</strong> ${formatDate(new Date())}</div>
    </div>
    <div>
      <span class="status-badge ${currentStatus.class}">${escapeHtml(currentStatus.text)}</span>
    </div>
  </div>

  <div class="stats-grid">
    <div class="stat-card">
      <div class="stat-label">Total CSV Rows</div>
      <div class="stat-val">${report.totalRows || 0}</div>
    </div>
    <div class="stat-card imported">
      <div class="stat-label">Successfully Imported</div>
      <div class="stat-val">${report.importedRows || 0}</div>
    </div>
    <div class="stat-card anomalous">
      <div class="stat-label">Anomalous / Skipped</div>
      <div class="stat-val">${report.anomalousRows || 0}</div>
    </div>
  </div>

  <div class="section-title">Detected Anomalies / Action Taken Logs</div>
  <table>
    <thead>
      <tr>
        <th style="width: 80px; text-align: center;">Location</th>
        <th style="width: 100px; text-align: center;">Severity</th>
        <th>Anomaly details & Actions Taken</th>
      </tr>
    </thead>
    <tbody>
      ${anomaliesHtml}
    </tbody>
  </table>

  <div class="footer">
    SplitWise Shared Expenses Application &copy; ${new Date().getFullYear()} - Audit Log Export
  </div>

  <script>
    window.addEventListener('load', () => {
      // Delay slightly to ensure fonts render before printing
      setTimeout(() => {
        window.print();
        window.close();
      }, 500);
    });
  </script>
</body>
</html>
    `;

    printWindow.document.write(docContent);
    printWindow.document.close();
  };

  // Delete import
  const handleImportDelete = async (impId) => {
    if (!window.confirm("Are you sure you want to delete this import? This will delete the import record and permanently remove all expenses created by this import.")) {
      return;
    }
    try {
      await apiClient.delete(`/groups/${groupId}/imports/${impId}`);
      await reloadAllData();
    } catch (err) {
      console.error(err);
      alert("Failed to delete the import. Please try again.");
    }
  };

  // Check if current user is admin of group
  const isAdmin = members.some(m => m.userId === currentUser.id && m.role === "ADMIN" && !m.leftAt);

  if (error) {
    return (
      <div className="rounded-xl bg-red-50 p-6 text-center text-red-600 border border-red-100">
        <h2 className="text-xl font-bold">Error</h2>
        <p className="mt-2">{error}</p>
        <Link to="/" className="mt-4 inline-block text-brand-600 font-semibold hover:underline">
          Return to Dashboard
        </Link>
      </div>
    );
  }

  if (loading && !group) {
    return (
      <div className="flex justify-center items-center py-32">
        <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Back link */}
      <div>
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-500 hover:text-slate-800 transition-colors">
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back to Dashboard
        </Link>
      </div>

      {/* Group Header Info */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-800">{group?.name}</h1>
          <p className="mt-1.5 text-sm text-slate-500 max-w-2xl">
            {group?.description || "No description provided."}
          </p>
        </div>
        
        {/* Quick statistics */}
        <div className="flex items-center gap-6 border-t md:border-t-0 md:border-l border-slate-100 pt-4 md:pt-0 md:pl-6">
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Total spent</span>
            <span className="text-lg font-bold text-slate-800">{formatCurrency(currentBalances?.summary?.totalSpending, activeCurrency)}</span>
          </div>
          <div>
            <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider block">Your share</span>
            {currentBalances?.balances?.[currentUser.id] ? (
              <span className={`text-lg font-bold ${
                parseFloat(currentBalances.balances[currentUser.id].netBalance) > 0.0001
                  ? "text-emerald-600"
                  : parseFloat(currentBalances.balances[currentUser.id].netBalance) < -0.0001
                    ? "text-rose-600"
                    : "text-slate-500"
              }`}>
                {parseFloat(currentBalances.balances[currentUser.id].netBalance) > 0 ? "+" : ""}
                {formatCurrency(currentBalances.balances[currentUser.id].netBalance, activeCurrency)}
              </span>
            ) : (
              <span className="text-lg font-bold text-slate-500">{formatCurrency(0, activeCurrency)}</span>
            )}
          </div>
        </div>
      </div>

      {/* Tabs Menu */}
      <div className="border-b border-slate-200">
        <div className="flex gap-6 overflow-x-auto">
          {["overview", "expenses", "settlements", "members", "imports"].map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`pb-4 text-sm font-semibold capitalize border-b-2 px-1 transition-all whitespace-nowrap ${
                activeTab === tab
                  ? "border-brand-600 text-brand-600"
                  : "border-transparent text-slate-500 hover:text-slate-800"
              }`}
            >
              {tab === "overview" ? "Overview (Balances)" : tab === "imports" ? "CSV Imports" : tab}
            </button>
          ))}
        </div>
      </div>

      {/* ---------------- TABS CONTENTS ---------------- */}

      {/* 1. OVERVIEW (BALANCES & SUGGESTED TRANSFERS) */}
      {activeTab === "overview" && (
        <div className="space-y-6">
          {/* Currency Toggle */}
          <div className="flex justify-start">
            <div className="inline-flex rounded-xl bg-slate-100 p-1">
              {[
                { code: "USD", label: "USD ($)" },
                { code: "INR", label: "INR (₹)" }
              ].map((c) => (
                <button
                  key={c.code}
                  onClick={() => setActiveCurrency(c.code)}
                  className={`rounded-lg px-4 py-1.5 text-xs font-bold transition-all ${
                    activeCurrency === c.code
                      ? "bg-white text-slate-800 shadow-sm"
                      : "text-slate-500 hover:text-slate-800"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Member balances list */}
            <div className="lg:col-span-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 mb-4">Member Balances</h2>
              <div className="divide-y divide-slate-100">
                {currentBalances?.balances && Object.keys(currentBalances.balances).map((uId) => {
                  const b = currentBalances.balances[uId];
                  const net = parseFloat(b.netBalance);
                  const isPast = b.leftAt !== null;

                  return (
                    <div key={uId} className="py-4 flex items-center justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-800">{b.name}</span>
                          {uId === currentUser.id && (
                            <span className="rounded bg-brand-50 px-1.5 py-0.5 text-[10px] font-bold text-brand-700">You</span>
                          )}
                          {isPast && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">Left Group</span>
                          )}
                        </div>
                        <span className="text-xs text-slate-400 block">{b.email}</span>
                      </div>

                      <div>
                        {net > 0.0001 ? (
                          <span className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                            owed +{formatCurrency(net, activeCurrency)}
                          </span>
                        ) : net < -0.0001 ? (
                          <span className="text-sm font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full">
                            owes {formatCurrency(Math.abs(net), activeCurrency)}
                          </span>
                        ) : (
                          <span className="text-sm font-bold text-slate-400 bg-slate-50 px-2.5 py-1 rounded-full">
                            settled
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Transfers / Who pays whom panel */}
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-xl font-bold text-slate-800 mb-4">Suggested Transfers</h2>
              {currentBalances?.transfers?.length === 0 ? (
                <div className="text-center py-12 text-slate-400">
                  <svg className="mx-auto h-12 w-12 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <p className="mt-2 text-sm font-medium">All debts are settled! No transfers needed.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {currentBalances?.transfers?.map((tr, index) => (
                    <div key={index} className="rounded-xl border border-slate-100 bg-slate-50/50 p-4 space-y-3">
                      <div className="text-sm text-slate-600">
                        <strong className="text-slate-800">{tr.fromName}</strong> owes <strong className="text-slate-800">{tr.toName}</strong>:
                      </div>
                      <div className="text-xl font-extrabold text-slate-800">
                        {formatCurrency(tr.amount, activeCurrency)}
                      </div>
                      {/* Render Quick Settle button if current user is either from or to, or is admin */}
                      <button
                        onClick={() => handleQuickSettle(tr.from, tr.to, parseFloat(tr.amount).toString())}
                        className="w-full inline-flex justify-center items-center gap-1.5 rounded-lg bg-brand-50 py-1.5 text-xs font-bold text-brand-700 hover:bg-brand-100 transition-colors"
                      >
                        Record payment / Settle Up
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 2. EXPENSES TAB */}
      {activeTab === "expenses" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Expenses</h2>
              <p className="text-xs text-slate-500">List of shared costs and splits</p>
            </div>
            <button
              onClick={openAddExpense}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500 shadow-sm transition-all hover:scale-102"
            >
              Add Expense
            </button>
          </div>

          {expenses.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <p className="text-slate-400">No expenses recorded yet in this group.</p>
              <button
                onClick={openAddExpense}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 transition-all"
              >
                Create first expense
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm divide-y divide-slate-100">
                {expenses.map((exp) => {
                  const dateStr = new Date(exp.expenseDate).toLocaleDateString("en-US", {
                    month: "short",
                    day: "numeric",
                    year: "numeric",
                    timeZone: "UTC"
                  });

                  const isCreator = exp.createdById === currentUser.id;
                  const canEdit = isCreator || isAdmin;

                  return (
                    <div key={exp.id} className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50/50 transition-colors">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <strong className="text-base text-slate-800">{exp.description}</strong>
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500 uppercase tracking-wide">
                            {exp.splitMethod}
                          </span>
                        </div>
                        <div className="text-xs text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                          <span>Paid by <strong>{exp.paidBy.name}</strong></span>
                          <span>&bull;</span>
                          <span>{dateStr}</span>
                          {exp.importId && (
                            <>
                              <span>&bull;</span>
                              <span className="text-brand-600 font-semibold flex items-center gap-0.5">
                                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
                                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                                </svg>
                                Imported
                              </span>
                            </>
                          )}
                        </div>
                        {exp.notes && <p className="text-xs text-slate-500 line-clamp-1 italic">"{exp.notes}"</p>}
                      </div>

                      <div className="flex items-center gap-6 w-full sm:w-auto justify-between sm:justify-end">
                        <div className="text-right">
                          <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Amount</span>
                          <span className="text-lg font-bold text-slate-800">{formatCurrency(exp.amount, exp.currency)}</span>
                        </div>

                        {canEdit && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => openEditExpense(exp)}
                              className="rounded p-1.5 text-slate-400 hover:text-brand-600 hover:bg-slate-100 transition-colors"
                              title="Edit Expense"
                            >
                              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                              </svg>
                            </button>
                            <button
                              onClick={() => handleDeleteExpense(exp.id)}
                              className="rounded p-1.5 text-slate-400 hover:text-rose-600 hover:bg-slate-100 transition-colors"
                              title="Delete Expense"
                            >
                              <svg className="h-4.5 w-4.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                                <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Pagination controls */}
              <div className="flex justify-between items-center py-2">
                <span className="text-sm text-slate-500">
                  Showing page {expensesPagination.page} of {Math.ceil(expensesPagination.total / expensesPagination.pageSize) || 1}
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={expensesPagination.page === 1}
                    onClick={() => fetchExpenses(expensesPagination.page - 1)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    Previous
                  </button>
                  <button
                    disabled={expensesPagination.page * expensesPagination.pageSize >= expensesPagination.total}
                    onClick={() => fetchExpenses(expensesPagination.page + 1)}
                    className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* 3. SETTLEMENTS TAB */}
      {activeTab === "settlements" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Settlements</h2>
              <p className="text-xs text-slate-500">Direct member payments to settle debts</p>
            </div>
            <button
              onClick={() => {
                setSettlePayerId(currentUser.id);
                // Pre-select receiver as first non-user member
                const firstOther = members.find(m => m.userId !== currentUser.id && !m.leftAt);
                setSettleRecipientId(firstOther?.userId || "");
                setSettleAmount("");
                setSettleNotes("");
                setSettleDate(new Date().toISOString().slice(0, 10));
                setSettleCurrency(activeCurrency);
                setSettlementFormError(null);
                setShowSettlementModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500 shadow-sm transition-all hover:scale-102"
            >
              Record Settlement
            </button>
          </div>

          {settlements.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <p className="text-slate-400">No settlements recorded yet in this group.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm divide-y divide-slate-100">
              {settlements.map((s) => {
                const dateStr = new Date(s.settledAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                });

                return (
                  <div key={s.id} className="p-5 flex justify-between items-center hover:bg-slate-50/50 transition-colors">
                    <div>
                      <div className="text-sm text-slate-700">
                        <strong className="text-slate-800 font-semibold">{s.paidBy.name}</strong> settled up with <strong className="text-slate-800 font-semibold">{s.paidTo.name}</strong>
                      </div>
                      <div className="text-xs text-slate-400 mt-1">
                        <span>{dateStr}</span>
                        <span>&bull;</span>
                        <span>Recorded by {s.recordedBy.name}</span>
                      </div>
                      {s.notes && <p className="text-xs text-slate-500 mt-1 italic">"{s.notes}"</p>}
                    </div>

                    <div className="text-right">
                      <span className="text-xs text-slate-400 block font-semibold uppercase tracking-wider">Settled</span>
                      <span className="text-base font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full">
                        {formatCurrency(s.amount, s.currency)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4. MEMBERS TAB */}
      {activeTab === "members" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-800">Members</h2>
              <p className="text-xs text-slate-500">Manage group memberships</p>
            </div>
            
            {isAdmin && (
              <button
                onClick={() => {
                  setMemberEmail("");
                  setMemberJoinDate(new Date().toISOString().slice(0, 10));
                  setMemberFormError(null);
                  setShowMemberModal(true);
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500 shadow-sm transition-all hover:scale-102"
              >
                Add Member
              </button>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm divide-y divide-slate-100">
            {members.map((m) => {
              const joinStr = new Date(m.joinedAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
              });
              const leftStr = m.leftAt ? new Date(m.leftAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
                year: "numeric"
              }) : null;

              const isUserCreator = group?.createdById === m.userId;
              const canRemove = isAdmin && !m.leftAt && !isUserCreator;

              return (
                <div key={m.id} className="p-5 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 hover:bg-slate-50/50 transition-colors">
                  <div>
                    <div className="flex items-center gap-2">
                      <strong className="text-base text-slate-800">{m.user.name}</strong>
                      <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                        m.role === "ADMIN" ? "bg-purple-50 text-purple-700" : "bg-slate-100 text-slate-600"
                      }`}>
                        {m.role}
                      </span>
                      {isUserCreator && (
                        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">Creator</span>
                      )}
                    </div>
                    <span className="text-xs text-slate-400 block mt-0.5">{m.user.email}</span>
                    <div className="text-xs text-slate-400 mt-2 flex flex-col sm:flex-row sm:gap-4">
                      <span>Joined: <strong>{joinStr}</strong></span>
                      {leftStr && <span className="text-rose-600 font-semibold">Left: <strong>{leftStr}</strong></span>}
                    </div>
                  </div>

                  {canRemove && (
                    <button
                      onClick={() => {
                        setMemberToRemove(m);
                        setMemberLeaveDate(new Date().toISOString().slice(0, 10));
                        setRemoveMemberFormError(null);
                        setShowRemoveMemberModal(true);
                      }}
                      className="rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 hover:bg-rose-50 hover:border-rose-300 transition-colors shadow-sm"
                    >
                      Remove Member
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. CSV IMPORTS TAB */}
      {activeTab === "imports" && (
        <div className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold text-slate-800">CSV Import Portal</h2>
              <p className="text-xs text-slate-500">Bulk import expenses via CSV files</p>
            </div>
            
            <button
              onClick={() => {
                setCsvFileContent("");
                setCsvFileName("");
                setImportFormError(null);
                setShowImportModal(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-500 shadow-sm transition-all hover:scale-102"
            >
              Import CSV File
            </button>
          </div>

          {imports.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
              <p className="text-slate-400">No CSV imports performed yet in this group.</p>
            </div>
          ) : (
            <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden shadow-sm divide-y divide-slate-100">
              {imports.map((imp) => {
                const dateStr = new Date(imp.createdAt).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric"
                });

                return (
                  <div key={imp.id} className="p-5 flex justify-between items-center hover:bg-slate-50/50 transition-colors">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <strong className="text-slate-800">{imp.fileName}</strong>
                        <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${
                          imp.status === "COMPLETED"
                            ? "bg-emerald-50 text-emerald-700"
                            : imp.status === "COMPLETED_WITH_ANOMALIES"
                              ? "bg-amber-50 text-amber-700"
                              : "bg-red-50 text-red-700"
                        }`}>
                          {imp.status.replace(/_/g, " ")}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 mt-1.5 space-x-3">
                        <span>Imported on: <strong>{dateStr}</strong></span>
                        <span>&bull;</span>
                        <span>Total Rows: <strong>{imp.totalRows || 0}</strong></span>
                        <span>&bull;</span>
                        <span>Imported: <strong className="text-emerald-600">{imp.importedRows}</strong></span>
                        <span>&bull;</span>
                        <span>Anomalies/Skipped: <strong className="text-rose-600">{imp.anomalousRows}</strong></span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button
                        onClick={() => openImportReport(imp.id)}
                        className="rounded-lg border border-slate-200 bg-white px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors shadow-sm"
                      >
                        View Report
                      </button>
                      <button
                        onClick={() => handleImportDelete(imp.id)}
                        className="rounded-lg border border-rose-200 bg-white px-3.5 py-1.5 text-xs font-bold text-rose-600 hover:bg-rose-50 transition-colors shadow-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ------------------- MODALS DEFINITIONS ------------------- */}

      {/* 1. EXPENSE MODAL */}
      {showExpenseModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl border border-slate-100 max-h-[90vh] overflow-y-auto my-8">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800">
                {expenseIdToEdit ? "Edit Expense" : "Add New Expense"}
              </h3>
              <button onClick={() => setShowExpenseModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {expenseFormError && (
              <div className="mt-4 rounded-md bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {expenseFormError}
              </div>
            )}

            <form className="mt-4 space-y-4" onSubmit={handleExpenseSubmit}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
                  <input
                    type="text"
                    required
                    value={expDesc}
                    onChange={(e) => setExpDesc(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm"
                    placeholder="e.g. Dinner, Rent"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount & Currency</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      required
                      value={expAmount}
                      onChange={(e) => setExpAmount(e.target.value)}
                      className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm"
                      placeholder="0.00"
                    />
                    <select
                      value={expCurrency}
                      onChange={(e) => setExpCurrency(e.target.value)}
                      className="block rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm bg-white font-medium"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="INR">INR (₹)</option>
                    </select>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Paid By</label>
                  <select
                    value={expPayerId}
                    onChange={(e) => setExpPayerId(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm bg-white"
                  >
                    {members.filter(m => !m.leftAt).map(m => (
                      <option key={m.userId} value={m.userId}>{m.user.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Expense Date</label>
                  <input
                    type="date"
                    required
                    value={expDate}
                    onChange={(e) => setExpDate(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Split Method</label>
                <select
                  value={expSplitMethod}
                  onChange={(e) => setExpSplitMethod(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm bg-white"
                >
                  <option value="EQUAL">EQUAL (split evenly)</option>
                  <option value="EXACT">EXACT (specify exact amounts)</option>
                  <option value="PERCENTAGE">PERCENTAGE (specify % share)</option>
                  <option value="CUSTOM">CUSTOM (specify relative weights)</option>
                </select>
              </div>

              {/* Participants selection block */}
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Split Participants</label>
                <div className="border border-slate-200 rounded-lg p-3 space-y-2.5 max-h-[160px] overflow-y-auto">
                  {members.filter(m => !m.leftAt).map((m) => {
                    const pState = expParticipants[m.userId] || { checked: false, val: "" };
                    return (
                      <div key={m.userId} className="flex items-center justify-between gap-4">
                        <label className="flex items-center gap-2 text-sm text-slate-700 font-medium">
                          <input
                            type="checkbox"
                            checked={pState.checked}
                            onChange={(e) => {
                              setExpParticipants({
                                ...expParticipants,
                                [m.userId]: { ...pState, checked: e.target.checked }
                              });
                            }}
                            className="rounded text-brand-600 focus:ring-brand-500 h-4 w-4 border-slate-300"
                          />
                          {m.user.name}
                        </label>

                        {pState.checked && expSplitMethod !== "EQUAL" && (
                          <div className="flex items-center gap-1.5">
                            <input
                              type="number"
                              step="0.01"
                              required
                              value={pState.val}
                              placeholder={
                                expSplitMethod === "EXACT"
                                  ? (expCurrency === "INR" ? "₹ amount" : "$ amount")
                                  : expSplitMethod === "PERCENTAGE"
                                    ? "% percent"
                                    : "weight"
                              }
                              onChange={(e) => {
                                setExpParticipants({
                                  ...expParticipants,
                                  [m.userId]: { ...pState, val: e.target.value }
                                });
                              }}
                              className="w-24 rounded border border-slate-300 px-2 py-0.5 text-xs text-right focus:outline-none focus:border-brand-500"
                            />
                            <span className="text-xs text-slate-400">
                              {expSplitMethod === "EXACT" ? (expCurrency === "INR" ? "₹" : "$") : expSplitMethod === "PERCENTAGE" ? "%" : "w"}
                            </span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
                <textarea
                  value={expNotes}
                  onChange={(e) => setExpNotes(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm"
                  rows="2"
                  placeholder="Notes about this expense"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowExpenseModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={expenseFormLoading}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  {expenseFormLoading ? "Saving..." : expenseIdToEdit ? "Save Changes" : "Create Expense"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. SETTLEMENT MODAL */}
      {showSettlementModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800">Record Settlement Payment</h3>
              <button onClick={() => setShowSettlementModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {settlementFormError && (
              <div className="mt-4 rounded-md bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {settlementFormError}
              </div>
            )}

            <form className="mt-4 space-y-4" onSubmit={handleSettlementSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Payer (Who Paid)</label>
                <select
                  value={settlePayerId}
                  onChange={(e) => setSettlePayerId(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm bg-white"
                >
                  <option value="">-- Select Payer --</option>
                  {members.filter(m => !m.leftAt).map(m => (
                    <option key={m.userId} value={m.userId}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Recipient (Who Received)</label>
                <select
                  value={settleRecipientId}
                  onChange={(e) => setSettleRecipientId(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm bg-white"
                >
                  <option value="">-- Select Recipient --</option>
                  {members.filter(m => !m.leftAt).map(m => (
                    <option key={m.userId} value={m.userId}>{m.user.name}</option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Amount & Currency</label>
                  <div className="flex gap-2">
                    <input
                      type="number"
                      step="0.0001"
                      min="0.0001"
                      required
                      value={settleAmount}
                      onChange={(e) => setSettleAmount(e.target.value)}
                      className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm"
                      placeholder="0.00"
                    />
                    <select
                      value={settleCurrency}
                      onChange={(e) => setSettleCurrency(e.target.value)}
                      className="block rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm bg-white font-medium"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="INR">INR (₹)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Settled At</label>
                  <input
                    type="date"
                    required
                    value={settleDate}
                    onChange={(e) => setSettleDate(e.target.value)}
                    className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Notes (Optional)</label>
                <textarea
                  value={settleNotes}
                  onChange={(e) => setSettleNotes(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm"
                  rows="2"
                  placeholder="e.g. Settle dinner debt"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSettlementModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={settlementFormLoading}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  {settlementFormLoading ? "Saving..." : "Record Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 3. ADD MEMBER MODAL */}
      {showMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800">Add New Group Member</h3>
              <button onClick={() => setShowMemberModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {memberFormError && (
              <div className="mt-4 rounded-md bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {memberFormError}
              </div>
            )}

            <form className="mt-4 space-y-4" onSubmit={handleAddMemberSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">User Email Address</label>
                <input
                  type="email"
                  required
                  value={memberEmail}
                  onChange={(e) => setMemberEmail(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none sm:text-sm"
                  placeholder="friend@example.com"
                />
                <p className="mt-1 text-[11px] text-slate-400">
                  The user must already be registered in the system to join this group.
                </p>
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Joined Date</label>
                <input
                  type="date"
                  required
                  value={memberJoinDate}
                  onChange={(e) => setMemberJoinDate(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowMemberModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={memberFormLoading}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  {memberFormLoading ? "Adding..." : "Add Member"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. REMOVE MEMBER MODAL */}
      {showRemoveMemberModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800 text-rose-600">Remove Group Member</h3>
              <button onClick={() => setShowRemoveMemberModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {removeMemberFormError && (
              <div className="mt-4 rounded-md bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {removeMemberFormError}
              </div>
            )}

            <form className="mt-4 space-y-4" onSubmit={handleRemoveMemberSubmit}>
              <p className="text-sm text-slate-600">
                Are you sure you want to remove <strong className="text-slate-800">{memberToRemove?.user?.name}</strong> from the group?
                This does not delete their membership history, but sets their leave date so they can't participate in future expenses.
              </p>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Leave Date</label>
                <input
                  type="date"
                  required
                  value={memberLeaveDate}
                  onChange={(e) => setMemberLeaveDate(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 focus:border-brand-500 focus:outline-none sm:text-sm"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowRemoveMemberModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={removeMemberFormLoading}
                  className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-semibold text-white hover:bg-rose-500 disabled:opacity-50"
                >
                  {removeMemberFormLoading ? "Removing..." : "Confirm Removal"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 5. CSV IMPORT MODAL */}
      {showImportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800">Import Expenses via CSV</h3>
              <button onClick={() => setShowImportModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {importFormError && (
              <div className="mt-4 rounded-md bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {importFormError}
              </div>
            )}

            <form className="mt-4 space-y-4" onSubmit={handleImportSubmit}>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-2">Select CSV File</label>
                <input
                  type="file"
                  accept=".csv"
                  required
                  onChange={handleFileChange}
                  className="block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-sm file:font-semibold file:bg-brand-50 file:text-brand-700 hover:file:bg-brand-100 cursor-pointer"
                />
              </div>

              {csvFileName && (
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-3 flex items-center justify-between">
                  <span className="text-xs text-slate-600 font-semibold max-w-[280px] truncate">{csvFileName}</span>
                  <span className="text-[10px] font-bold text-slate-400">{(csvFileContent.length / 1024).toFixed(2)} KB</span>
                </div>
              )}

              <div className="text-xs text-slate-400 bg-slate-50 p-3 rounded-lg leading-relaxed">
                <strong>Expected CSV headers:</strong>
                <code className="block mt-1 p-1 bg-slate-150 rounded text-slate-700 select-all overflow-x-auto text-[10px]">
                  date,description,amount,currency,payer_email,split_method,participants
                </code>
                <span className="block mt-1">
                  Example participants value for EQUAL split:<br />
                  <code className="text-slate-600 select-all font-semibold">user1@example.com;user2@example.com</code>
                </span>
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowImportModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={importFormLoading || !csvFileContent}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 disabled:opacity-50"
                >
                  {importFormLoading ? "Uploading..." : "Start Import"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. VIEW IMPORT REPORT MODAL */}
      {showReportModal && selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="w-full max-w-2xl rounded-2xl bg-white p-6 shadow-xl border border-slate-100 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-lg font-bold text-slate-800">CSV Import Report</h3>
                <span className="text-xs text-slate-500 font-semibold block mt-0.5">{selectedReport.fileName}</span>
              </div>
              <button onClick={() => setShowReportModal(false)} className="text-slate-400 hover:text-slate-600">
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Statistics Banner */}
            <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400">Total Rows</span>
                <p className="text-lg font-bold text-slate-800 mt-0.5">{selectedReport.totalRows || 0}</p>
              </div>
              <div className="bg-emerald-50/50 rounded-xl p-3 text-center border border-emerald-100/30">
                <span className="text-[10px] uppercase font-bold text-emerald-600">Imported</span>
                <p className="text-lg font-bold text-emerald-700 mt-0.5">{selectedReport.importedRows}</p>
              </div>
              <div className="bg-rose-50/50 rounded-xl p-3 text-center border border-rose-100/30">
                <span className="text-[10px] uppercase font-bold text-rose-600">Anomalous/Skipped</span>
                <p className="text-lg font-bold text-rose-700 mt-0.5">{selectedReport.anomalousRows}</p>
              </div>
              <div className="bg-slate-50 rounded-xl p-3 text-center">
                <span className="text-[10px] uppercase font-bold text-slate-400">Status</span>
                <p className={`text-xs font-bold mt-1.5 uppercase ${
                  selectedReport.status === "COMPLETED"
                    ? "text-emerald-600"
                    : selectedReport.status === "COMPLETED_WITH_ANOMALIES"
                      ? "text-amber-600"
                      : "text-rose-600"
                }`}>
                  {selectedReport.status.replace(/_/g, " ")}
                </p>
              </div>
            </div>

            {/* List of Anomalies (Errors and Warnings) */}
            <div className="mt-6">
              <h4 className="text-sm font-bold text-slate-800 mb-3">Detected Anomalies / Audit Log</h4>
              {selectedReport.anomalies?.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs border border-dashed border-slate-200 rounded-xl">
                  No anomalies or warnings detected. Clean import!
                </div>
              ) : (
                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 max-h-[300px] overflow-y-auto">
                  {selectedReport.anomalies.map((anom) => (
                    <div key={anom.id} className="p-3 flex items-start gap-3 text-xs hover:bg-slate-50/50">
                      <span className={`rounded px-1.5 py-0.5 font-bold uppercase tracking-wider text-[9px] mt-0.5 ${
                        anom.severity === "ERROR" ? "bg-red-50 text-red-700 border border-red-100" : "bg-amber-50 text-amber-700 border border-amber-100"
                      }`}>
                        {anom.severity}
                      </span>
                      <div className="space-y-1">
                        <div className="text-slate-800">
                          Row {anom.rowNumber}: <strong className="text-slate-900 font-semibold">{anom.code}</strong> - {anom.message}
                        </div>
                        {anom.rawData && (
                          <details className="cursor-pointer text-slate-400 hover:text-slate-600 font-mono text-[9px]">
                            <summary className="outline-none">View row raw data</summary>
                            <pre className="mt-1 p-2 bg-slate-50 border border-slate-100 rounded text-slate-500 whitespace-pre-wrap select-all">
                              {anom.rawData}
                            </pre>
                          </details>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-6 flex justify-end pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => downloadReportPDF(selectedReport)}
                className="mr-2 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-colors cursor-pointer"
              >
                Download PDF
              </button>
              <button
                type="button"
                onClick={() => setShowReportModal(false)}
                className="rounded-lg bg-slate-850 px-4 py-2 text-sm font-semibold text-slate-800 hover:bg-slate-100 border border-slate-200"
              >
                Close Report
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
