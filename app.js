(function () {
  "use strict";

  const CONFIG = window.OC_HOT_CONFIG || {};
  const STORAGE_KEYS = {
    votes: "oc-hot-votes:v1",
    submissions: "oc-hot-submissions:v1",
    clientId: "oc-hot-client:v1"
  };

  const fallbackItems = [
    {
      id: "blankland-chicken-origin",
      title: "爆！#在原驻地大肆放鸡の人到底是何方神圣#",
      project: "空白地热搜榜",
      summary: "原驻地突然出现大量鸡，匿名目击者正在追查放鸡者身份。",
      tags: ["空白地", "原驻地", "放鸡"],
      approvedAt: "2026-07-11T23:10:00+08:00"
    },
    {
      id: "blankland-floating-player",
      title: "#我是疯了吗怎么会看到人在天上飘#",
      project: "空白地热搜榜",
      summary: "多名玩家声称在空白地上空看到异常漂浮现象，系统暂无解释。",
      tags: ["空白地", "异常", "目击"],
      approvedAt: "2026-07-11T22:55:00+08:00"
    },
    {
      id: "blankland-past-work-card",
      title: "#震惊某玩家竟在副本登记处提交前世工牌系统为何沉默三秒#",
      project: "空白地热搜榜",
      summary: "副本登记处出现疑似前世工牌，系统短暂沉默后仍未公开说明。",
      tags: ["副本", "系统", "前世"],
      approvedAt: "2026-07-11T22:40:00+08:00"
    }
  ];

  const state = {
    items: [],
    sort: "hot",
    query: "",
    votes: readJson(STORAGE_KEYS.votes, {}),
    remoteCounts: {},
    supabaseAvailable: hasSupabaseConfig()
  };

  const formatter = new Intl.NumberFormat("zh-CN", {
    notation: "compact",
    maximumFractionDigits: 1
  });

  const elements = {};

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    elements.hotList = document.querySelector("#hotList");
    elements.template = document.querySelector("#hotItemTemplate");
    elements.searchInput = document.querySelector("#searchInput");
    elements.sortButtons = document.querySelectorAll("[data-sort]");
    elements.submitForm = document.querySelector("#submitForm");
    elements.submitStatus = document.querySelector("#submitStatus");
    elements.totalCount = document.querySelector("#totalCount");
    elements.peakHeat = document.querySelector("#peakHeat");
    elements.voteMode = document.querySelector("#voteMode");
    elements.submitMode = document.querySelector("#submitMode");
    elements.exportSubmissions = document.querySelector("#exportSubmissions");

    wireEvents();
    setModes();
    state.items = await loadHotItems();
    render();
    await loadRemoteVoteCounts();
    if (hasSupabaseConfig()) {
      window.setInterval(loadRemoteVoteCounts, 15000);
    }
    updateExportButton();
  }

  function wireEvents() {
    elements.searchInput.addEventListener("input", (event) => {
      state.query = event.target.value.trim().toLowerCase();
      render();
    });

    elements.sortButtons.forEach((button) => {
      button.addEventListener("click", () => {
        state.sort = button.dataset.sort;
        elements.sortButtons.forEach((item) => item.classList.toggle("is-active", item === button));
        render();
      });
    });

    elements.hotList.addEventListener("click", (event) => {
      const voteButton = event.target.closest("[data-vote]");
      const tagButton = event.target.closest("[data-tag]");

      if (voteButton) {
        castVote(voteButton.dataset.itemId, voteButton.dataset.vote);
      }

      if (tagButton) {
        elements.searchInput.value = tagButton.dataset.tag;
        state.query = tagButton.dataset.tag.toLowerCase();
        render();
      }
    });

    elements.submitForm.addEventListener("submit", handleSubmit);
    elements.exportSubmissions.addEventListener("click", exportLocalSubmissions);
  }

  function setModes() {
    elements.voteMode.textContent = hasSupabaseConfig() || CONFIG.VOTE_ENDPOINT ? "实时" : "本机";
    elements.submitMode.textContent = hasSupabaseConfig() || CONFIG.SUBMISSION_ENDPOINT || CONFIG.OWNER_EMAIL ? "在线" : "本机";
    document.title = CONFIG.SITE_NAME || "空白地热搜榜";
  }

  function hasSupabaseConfig() {
    return Boolean(getSupabaseUrl() && getSupabaseKey());
  }

  function getSupabaseUrl() {
    return String(CONFIG.SUPABASE_URL || "").trim().replace(/\/+$/, "");
  }

  function getSupabaseKey() {
    return String(CONFIG.SUPABASE_PUBLISHABLE_KEY || CONFIG.SUPABASE_ANON_KEY || "").trim();
  }

  async function supabaseRpc(functionName, body) {
    const response = await fetch(`${getSupabaseUrl()}/rest/v1/rpc/${functionName}`, {
      method: "POST",
      headers: {
        apikey: getSupabaseKey(),
        Authorization: `Bearer ${getSupabaseKey()}`,
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(body || {})
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      throw new Error(`${functionName} failed: ${response.status} ${detail}`);
    }

    if (response.status === 204) return null;
    return response.json();
  }

  async function loadRemoteVoteCounts() {
    if (!hasSupabaseConfig()) return;

    try {
      const rows = await supabaseRpc("get_vote_counts", {});
      state.remoteCounts = {};

      (Array.isArray(rows) ? rows : []).forEach((row) => {
        state.remoteCounts[row.item_id] = {
          likes: Number(row.likes || 0),
          dislikes: Number(row.dislikes || 0)
        };
      });

      state.supabaseAvailable = true;
      elements.voteMode.textContent = "实时";
      render();
    } catch (error) {
      state.supabaseAvailable = false;
      elements.voteMode.textContent = "本机";
      render();
    }
  }

  async function loadHotItems() {
    try {
      const response = await fetch("data/hotlist.json", { cache: "no-store" });
      if (!response.ok) throw new Error("hotlist request failed");
      const data = await response.json();
      return normalizeItems(Array.isArray(data) ? data : data.items);
    } catch (error) {
      return normalizeItems(fallbackItems);
    }
  }

  function normalizeItems(items) {
    return (items || [])
      .filter((item) => item && item.id && item.title)
      .map((item) => ({
        id: String(item.id),
        title: String(item.title || ""),
        project: String(item.project || "匿名企划"),
        summary: String(item.summary || ""),
        tags: normalizeTags(item.tags),
        likes: Number(item.likes || 0),
        dislikes: Number(item.dislikes || 0),
        approvedAt: item.approvedAt || item.createdAt || item.created_at || ""
      }));
  }

  function render() {
    const items = getVisibleItems();
    const peak = Math.max(1, ...state.items.map(getScore));

    elements.totalCount.textContent = String(state.items.length);
    elements.peakHeat.textContent = formatNumber(Math.max(0, ...state.items.map(getScore)));
    elements.hotList.innerHTML = "";

    if (!items.length) {
      elements.hotList.innerHTML = '<div class="empty-state">没有匹配的热搜</div>';
      return;
    }

    items.forEach((item, index) => {
      const node = elements.template.content.firstElementChild.cloneNode(true);
      const counts = getDisplayCounts(item);
      const score = getScore(item);
      const selectedVote = state.votes[item.id] || "";

      node.querySelector(".rank-number").textContent = `#${index + 1}`;
      setTrend(node.querySelector(".rank-trend"), counts);
      node.querySelector(".project-name").textContent = item.project;
      node.querySelector(".item-title").textContent = item.title;
      node.querySelector(".item-summary").textContent = item.summary;
      node.querySelector(".heat-score").textContent = formatNumber(score);
      node.querySelector(".meter span").style.setProperty("--meter-width", `${score > 0 ? Math.max(8, Math.round((score / peak) * 100)) : 0}%`);
      node.dataset.itemId = item.id;

      const tagRow = node.querySelector(".tag-row");
      item.tags.forEach((tag) => {
        const button = document.createElement("button");
        button.type = "button";
        button.dataset.tag = tag;
        button.textContent = `#${tag}`;
        tagRow.append(button);
      });

      node.querySelectorAll("[data-vote]").forEach((button) => {
        button.dataset.itemId = item.id;
        button.classList.toggle("is-selected", button.dataset.vote === selectedVote);
      });

      node.querySelector(".like-count").textContent = formatNumber(counts.likes);
      node.querySelector(".dislike-count").textContent = formatNumber(counts.dislikes);
      elements.hotList.append(node);
    });
  }

  function getVisibleItems() {
    const query = state.query;
    const items = query
      ? state.items.filter((item) => {
          const haystack = [item.title, item.project, item.summary, ...item.tags].join(" ").toLowerCase();
          return haystack.includes(query);
        })
      : [...state.items];

    return items.sort((a, b) => {
      if (state.sort === "new") {
        return Date.parse(b.approvedAt || 0) - Date.parse(a.approvedAt || 0);
      }

      if (state.sort === "likes") {
        return getDisplayCounts(b).likes - getDisplayCounts(a).likes;
      }

      return getScore(b) - getScore(a);
    });
  }

  function setTrend(element, counts) {
    const text = counts.likes === 0 && counts.dislikes === 0 ? "新" : counts.dislikes > counts.likes ? "争议" : "升温";
    element.textContent = text;
    element.classList.toggle("is-down", counts.dislikes > counts.likes);
    element.classList.toggle("is-flat", counts.likes === 0 && counts.dislikes === 0);
  }

  function getScore(item) {
    const counts = getDisplayCounts(item);
    return Math.max(0, counts.likes - counts.dislikes);
  }

  function getDisplayCounts(item) {
    if (state.supabaseAvailable) {
      const remote = state.remoteCounts[item.id] || { likes: 0, dislikes: 0 };
      return {
        likes: Math.max(0, item.likes + remote.likes),
        dislikes: Math.max(0, item.dislikes + remote.dislikes)
      };
    }

    const vote = state.votes[item.id];
    return {
      likes: Math.max(0, item.likes + (vote === "like" ? 1 : 0)),
      dislikes: Math.max(0, item.dislikes + (vote === "dislike" ? 1 : 0))
    };
  }

  async function castVote(itemId, vote) {
    const item = state.items.find((entry) => entry.id === itemId);
    if (!item || !["like", "dislike"].includes(vote)) return;

    const previousVote = state.votes[itemId] || "";
    const nextVote = previousVote === vote ? "" : vote;
    state.votes[itemId] = nextVote;
    if (!nextVote) delete state.votes[itemId];
    writeJson(STORAGE_KEYS.votes, state.votes);
    render();

    if (hasSupabaseConfig() && state.supabaseAvailable) {
      try {
        const rows = await supabaseRpc("cast_vote", {
          p_item_id: itemId,
          p_client_id: getClientId(),
          p_vote: nextVote
        });

        const result = Array.isArray(rows) ? rows[0] : rows;
        if (result && result.item_id) {
          state.remoteCounts[result.item_id] = {
            likes: Number(result.likes || 0),
            dislikes: Number(result.dislikes || 0)
          };
        }

        elements.voteMode.textContent = "实时";
        render();
        return;
      } catch (error) {
        state.supabaseAvailable = false;
        elements.voteMode.textContent = "本机";
        render();
        showStatus("投票同步失败，已暂存于本机", true);
        return;
      }
    }

    if (!CONFIG.VOTE_ENDPOINT) return;

    try {
      const response = await fetch(CONFIG.VOTE_ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId,
          vote: nextVote,
          previousVote,
          clientId: getClientId(),
          anonymous: true
        })
      });

      if (!response.ok) throw new Error("vote endpoint failed");
      const payload = await response.json().catch(() => null);
      if (payload && Number.isFinite(payload.likes) && Number.isFinite(payload.dislikes)) {
        item.likes = Number(payload.likes);
        item.dislikes = Number(payload.dislikes);
        render();
      }
    } catch (error) {
      showStatus("投票暂存于本机", true);
    }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    clearStatus();

    const formData = new FormData(elements.submitForm);
    const payload = {
      id: `sub_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      anonymous: true,
      status: "pending",
      createdAt: new Date().toISOString(),
      title: cleanText(formData.get("title"), 34),
      project: cleanText(formData.get("project"), 28),
      summary: cleanText(formData.get("summary"), 160),
      tags: parseTags(formData.get("tags")),
      link: cleanText(formData.get("link"), 240),
      reason: cleanText(formData.get("reason"), 280)
    };

    if (!payload.title || !payload.project || !payload.summary) {
      showStatus("标题、企划和概要不能为空", true);
      return;
    }

    try {
      if (hasSupabaseConfig() && state.supabaseAvailable) {
        await postSupabaseSubmission(payload);
        showStatus("已提交到待审核箱");
      } else if (CONFIG.SUBMISSION_ENDPOINT) {
        await postSubmission(payload);
        showStatus("已提交，等待站主审核");
      } else {
        saveLocalSubmission(payload);
        maybeOpenMail(payload);
        showStatus(CONFIG.OWNER_EMAIL ? "已打开邮件草稿" : "已保存为本机待审投稿");
      }

      elements.submitForm.reset();
      updateExportButton();
    } catch (error) {
      saveLocalSubmission(payload);
      updateExportButton();
      showStatus("提交入口暂不可用，已保存到本机", true);
    }
  }

  async function postSubmission(payload) {
    const response = await fetch(CONFIG.SUBMISSION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error("submission endpoint failed");
  }

  async function postSupabaseSubmission(payload) {
    await supabaseRpc("submit_hot_item", {
      p_title: payload.title,
      p_project: payload.project,
      p_summary: payload.summary,
      p_tags: payload.tags,
      p_link: payload.link || "",
      p_reason: payload.reason || "",
      p_client_id: getClientId()
    });
  }

  function maybeOpenMail(payload) {
    if (!CONFIG.OWNER_EMAIL) return;
    const subject = encodeURIComponent(`[空白地热搜投稿] ${payload.title}`);
    const body = encodeURIComponent(JSON.stringify(payload, null, 2));
    window.location.href = `mailto:${CONFIG.OWNER_EMAIL}?subject=${subject}&body=${body}`;
  }

  function saveLocalSubmission(payload) {
    const submissions = readJson(STORAGE_KEYS.submissions, []);
    submissions.push(payload);
    writeJson(STORAGE_KEYS.submissions, submissions);
  }

  function exportLocalSubmissions() {
    const submissions = readJson(STORAGE_KEYS.submissions, []);
    if (!submissions.length) return;

    const blob = new Blob([JSON.stringify({ submissions }, null, 2)], {
      type: "application/json"
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `oc-hot-submissions-${Date.now()}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  function updateExportButton() {
    const submissions = readJson(STORAGE_KEYS.submissions, []);
    elements.exportSubmissions.hidden = !submissions.length;
  }

  function parseTags(value) {
    return normalizeTags(
      String(value || "")
      .split(/[，,、\s]+/)
    );
  }

  function normalizeTags(tags) {
    return (Array.isArray(tags) ? tags : [])
      .map((tag) => String(tag || "").trim().replace(/^#+/, ""))
      .filter(Boolean)
      .slice(0, 5);
  }

  function cleanText(value, maxLength) {
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, maxLength);
  }

  function getClientId() {
    let clientId = localStorage.getItem(STORAGE_KEYS.clientId);
    if (!clientId) {
      clientId = `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(STORAGE_KEYS.clientId, clientId);
    }
    return clientId;
  }

  function formatNumber(value) {
    return formatter.format(Math.max(0, Number(value) || 0));
  }

  function showStatus(message, isError) {
    elements.submitStatus.textContent = message;
    elements.submitStatus.classList.toggle("is-error", Boolean(isError));
  }

  function clearStatus() {
    elements.submitStatus.textContent = "";
    elements.submitStatus.classList.remove("is-error");
  }

  function readJson(key, fallback) {
    try {
      const value = localStorage.getItem(key);
      return value ? JSON.parse(value) : fallback;
    } catch (error) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }
})();
