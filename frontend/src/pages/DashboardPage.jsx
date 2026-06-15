import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiClient } from "../api/client";

export function DashboardPage() {
  const [groups, setGroups] = useState([]);
  const [balances, setBalances] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Create Group Form State
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [createLoading, setCreateLoading] = useState(false);
  const [createError, setCreateError] = useState(null);

  const currentUser = JSON.parse(localStorage.getItem("user") || "{}");

  const fetchGroups = async () => {
    try {
      setLoading(true);
      const response = await apiClient.get("/groups");
      const fetchedGroups = response.data.data.groups;
      setGroups(fetchedGroups);

      // Fetch balances for each group to show net balance on the dashboard
      const balancePromises = fetchedGroups.map(async (g) => {
        try {
          const balRes = await apiClient.get(`/groups/${g.id}/balances`);
          const groupCurrenciesBal = {};
          for (const currency in balRes.data.data) {
            const userBal = balRes.data.data[currency]?.balances?.[currentUser.id];
            if (userBal) {
              groupCurrenciesBal[currency] = userBal.netBalance || "0.0000";
            }
          }
          return { groupId: g.id, balances: groupCurrenciesBal };
        } catch {
          return { groupId: g.id, balances: {} };
        }
      });

      const balanceResults = await Promise.all(balancePromises);
      const balanceMap = {};
      for (const res of balanceResults) {
        balanceMap[res.groupId] = res.balances;
      }
      setBalances(balanceMap);
    } catch (err) {
      console.error(err);
      setError("Failed to load your groups. Please check your connection.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchGroups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleCreateGroup = async (e) => {
    e.preventDefault();
    setCreateError(null);
    setCreateLoading(true);

    try {
      await apiClient.post("/groups", {
        name: groupName,
        description: groupDesc || null,
      });
      setGroupName("");
      setGroupDesc("");
      setShowCreateModal(false);
      fetchGroups();
    } catch (err) {
      console.error(err);
      setCreateError(err.response?.data?.error?.message || "Failed to create group.");
    } finally {
      setCreateLoading(false);
    }
  };

  // Calculate overall summary (how much owed in total across all groups per currency)
  const totalOwedByCurrency = {};
  const totalOwesByCurrency = {};
  const currencies = ["USD", "INR"];

  Object.values(balances).forEach((groupBals) => {
    for (const currency in groupBals) {
      const val = parseFloat(groupBals[currency]);
      if (val > 0.0001) {
        totalOwedByCurrency[currency] = (totalOwedByCurrency[currency] || 0) + val;
      } else if (val < -0.0001) {
        totalOwesByCurrency[currency] = (totalOwesByCurrency[currency] || 0) + Math.abs(val);
      }
    }
  });

  const netBalances = {};
  currencies.forEach((c) => {
    const owed = totalOwedByCurrency[c] || 0;
    const owes = totalOwesByCurrency[c] || 0;
    netBalances[c] = owed - owes;
  });

  const renderCurrencyList = (currencyMap, colorClass, prefix = "") => {
    const activeEntries = currencies.map(c => ({
      currency: c,
      val: currencyMap[c] || 0
    })).filter(entry => entry.val > 0.0001);

    if (activeEntries.length === 0) {
      return <span className="text-slate-100">$0.00</span>;
    }

    return activeEntries.map((entry) => {
      const symbol = entry.currency === "INR" ? "₹" : "$";
      return (
        <span key={entry.currency} className={`${colorClass} block`}>
          {prefix}{symbol}{entry.val.toFixed(2)}
        </span>
      );
    });
  };

  const renderNetBalanceList = () => {
    const activeEntries = currencies.map(c => ({
      currency: c,
      val: netBalances[c] || 0
    })).filter(entry => Math.abs(entry.val) > 0.0001);

    if (activeEntries.length === 0) {
      return <span className="text-slate-100">$0.00</span>;
    }

    return activeEntries.map((entry) => {
      const symbol = entry.currency === "INR" ? "₹" : "$";
      const color = entry.val > 0.0001 ? "text-emerald-300" : "text-rose-300";
      const sign = entry.val > 0.0001 ? "+" : entry.val < -0.0001 ? "-" : "";
      return (
        <span key={entry.currency} className={`${color} block`}>
          {sign}{symbol}{Math.abs(entry.val).toFixed(2)}
        </span>
      );
    });
  };

  return (
    <div className="space-y-8 animate-fade-in">
      {/* Top Banner/Summary */}
      <div className="rounded-2xl bg-gradient-to-r from-brand-600 to-teal-700 p-8 text-white shadow-lg relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 h-40 w-40 rounded-full bg-white/10 blur-xl" />
        <div className="absolute -left-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-xl" />
        <div className="relative z-10">
          <p className="text-sm font-semibold uppercase tracking-wider text-brand-100">
            Global Summary
          </p>
          <h1 className="mt-1 text-3xl font-extrabold tracking-tight sm:text-4xl">
            Welcome back, {currentUser.name}!
          </h1>
          
          <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-3 border-t border-brand-500/30 pt-6">
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <span className="text-xs text-brand-200 uppercase tracking-wider font-semibold">Total you are owed</span>
              <p className="mt-1 text-2xl font-bold text-emerald-300">
                {renderCurrencyList(totalOwedByCurrency, "text-emerald-300", "+")}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm">
              <span className="text-xs text-brand-200 uppercase tracking-wider font-semibold">Total you owe</span>
              <p className="mt-1 text-2xl font-bold text-rose-300">
                {renderCurrencyList(totalOwesByCurrency, "text-rose-300", "-")}
              </p>
            </div>
            <div className="rounded-xl bg-white/10 p-4 backdrop-blur-sm flex flex-col justify-center">
              <span className="text-xs text-brand-200 uppercase tracking-wider font-semibold">Net Balance</span>
              <div className="mt-1 text-2xl font-bold">
                {renderNetBalanceList()}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Groups Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-slate-800">Your Groups</h2>
          <p className="text-sm text-slate-500">Track and split expenses in group chats</p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-500 shadow-md transition-all hover:scale-102"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
          Create Group
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-red-50 p-6 text-center text-sm text-red-600 border border-red-100">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-16">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-200 border-t-brand-600" />
        </div>
      ) : groups.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white p-12 text-center shadow-sm">
          <svg className="mx-auto h-12 w-12 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
            <path strokeLinecap="round" strokeLinejoin="round" d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <h3 className="mt-4 text-lg font-semibold text-slate-800 font-sans">No groups yet</h3>
          <p className="mt-2 text-sm text-slate-500 max-w-sm mx-auto">
            You are not part of any shared expense groups yet. Create a group to start adding members and splitting expenses!
          </p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-brand-50 px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-100 transition-all"
          >
            Create your first group
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {groups.map((group) => {
            return (
              <Link
                key={group.id}
                to={`/groups/${group.id}`}
                className="group relative flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-sm hover:shadow-md hover:border-brand-200 transition-all duration-300 hover:-translate-y-1"
              >
                <div>
                  <h3 className="text-xl font-bold text-slate-800 group-hover:text-brand-600 transition-colors">
                    {group.name}
                  </h3>
                  <p className="mt-1 text-sm text-slate-500 line-clamp-2 h-10">
                    {group.description || "No description provided."}
                  </p>
                  
                  <div className="mt-4 flex items-center gap-2 text-xs text-slate-400 font-medium">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                    </svg>
                    <span>{group.members?.length || 0} members</span>
                  </div>
                </div>

                <div className="mt-6 border-t border-slate-100 pt-4 flex flex-col gap-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Your Balance</span>
                    {(() => {
                      const groupBals = balances[group.id] || {};
                      const activeBals = Object.entries(groupBals).filter(([, val]) => Math.abs(parseFloat(val)) > 0.0001);
                      
                      if (activeBals.length === 0) {
                        return (
                          <span className="text-sm font-bold text-slate-500 bg-slate-50 px-2.5 py-1 rounded-full">
                            Settled up
                          </span>
                        );
                      }

                      return (
                        <div className="flex flex-col gap-1 items-end">
                          {activeBals.map(([currency, valStr]) => {
                            const val = parseFloat(valStr);
                            const symbol = currency === "INR" ? "₹" : "$";
                            if (val > 0.0001) {
                              return (
                                <span key={currency} className="text-sm font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full animate-fade-in">
                                  Owed: +{symbol}{val.toFixed(2)}
                                </span>
                              );
                            } else {
                              return (
                                <span key={currency} className="text-sm font-bold text-rose-600 bg-rose-50 px-2.5 py-1 rounded-full animate-fade-in">
                                  Owe: -{symbol}{Math.abs(val).toFixed(2)}
                                </span>
                              );
                            }
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-lg font-bold text-slate-800">Create New Group</h3>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-400 hover:text-slate-600 transition-colors"
              >
                <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {createError && (
              <div className="mt-4 rounded-md bg-red-50 p-3 text-xs text-red-600 border border-red-100">
                {createError}
              </div>
            )}

            <form className="mt-4 space-y-4" onSubmit={handleCreateGroup}>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Group Name</label>
                <input
                  type="text"
                  required
                  value={groupName}
                  onChange={(e) => setGroupName(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-brand-500 sm:text-sm"
                  placeholder="e.g. Summer Vacation, Roommates"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Description (Optional)</label>
                <textarea
                  value={groupDesc}
                  onChange={(e) => setGroupDesc(e.target.value)}
                  className="block w-full rounded-lg border border-slate-300 px-3 py-2 text-slate-900 placeholder-slate-400 focus:border-brand-500 focus:outline-none focus:ring-brand-500 sm:text-sm"
                  rows="3"
                  placeholder="What is this group for?"
                />
              </div>

              <div className="mt-6 flex justify-end gap-3 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createLoading}
                  className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-500 transition-all disabled:opacity-50"
                >
                  {createLoading ? "Creating..." : "Create Group"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
