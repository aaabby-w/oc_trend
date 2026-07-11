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
      id: "moonfall-port-season-2",
      title: "月坠港二期开启",
      project: "月坠港档案",
      summary: "港区地图、阵营委托和新角色登记同步开放，首日招募热度冲上榜首。",
      tags: ["招募", "世界观", "活动"],
      heat: 9820,
      likes: 421,
      dislikes: 17,
      trend: "up",
      approvedAt: "2026-07-10T18:20:00+08:00"
    },
    {
      id: "redline-court-election",
      title: "红线审判庭换届",
      project: "绛星纪事",
      summary: "审判席位开放匿名提名，多个旧案角色线被重新整理。",
      tags: ["阵营", "剧情", "投票"],
      heat: 8610,
      likes: 366,
      dislikes: 28,
      trend: "up",
      approvedAt: "2026-07-09T21:35:00+08:00"
    },
    {
      id: "mist-school-open-day",
      title: "海雾学院开放日",
      project: "海雾学院",
      summary: "课程表、社团摊位和交换生名额释出，适合轻量日常向角色加入。",
      tags: ["校园", "日常", "轻量"],
      heat: 7440,
      likes: 287,
      dislikes: 11,
      trend: "flat",
      approvedAt: "2026-07-08T12:10:00+08:00"
    }
  ];

  const state = {
    items: [],
    sort: "hot",
    query: "",
    votes: readJson(STORAGE_KEYS.votes, {})
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
    elements.voteMode.textContent = CONFIG.VOTE_ENDPOINT ? "实时" : "本机";
    elements.submitMode.textContent = CONFIG.SUBMISSION_ENDPOINT || CONFIG.OWNER_EMAIL ? "在线" : "本机";
    document.title = CONFIG.SITE_NAME || "OC企划热搜榜";
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
        tags: Array.isArray(item.tags) ? item.tags.map(String).slice(0, 5) : [],
        heat: Number(item.heat || 0),
        likes: Number(item.likes || 0),
        dislikes: Number(item.dislikes || 0),
        trend: ["up", "down", "flat"].includes(item.trend) ? item.trend : "flat",
        approvedAt: item.approvedAt || item.createdAt || ""
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
      setTrend(node.querySelector(".rank-trend"), item.trend);
      node.querySelector(".project-name").textContent = item.project;
      node.querySelector(".item-title").textContent = item.title;
      node.querySelector(".item-summary").textContent = item.summary;
      node.querySelector(".heat-score").textContent = formatNumber(score);
      node.querySelector(".meter span").style.setProperty("--meter-width", `${Math.max(8, Math.round((score / peak) * 100))}%`);
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

  function setTrend(element, trend) {
    const text = trend === "up" ? "上升" : trend === "down" ? "回落" : "持平";
    element.textContent = text;
    element.classList.toggle("is-down", trend === "down");
    element.classList.toggle("is-flat", trend === "flat");
  }

  function getScore(item) {
    const counts = getDisplayCounts(item);
    const trendBonus = item.trend === "up" ? 260 : item.trend === "down" ? -160 : 0;
    return Math.max(0, Math.round(item.heat + counts.likes * 8 - counts.dislikes * 5 + trendBonus));
  }

  function getDisplayCounts(item) {
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
      if (CONFIG.SUBMISSION_ENDPOINT) {
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

  function maybeOpenMail(payload) {
    if (!CONFIG.OWNER_EMAIL) return;
    const subject = encodeURIComponent(`[OC热搜投稿] ${payload.title}`);
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
    return String(value || "")
      .split(/[，,、\s]+/)
      .map((tag) => tag.trim())
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
