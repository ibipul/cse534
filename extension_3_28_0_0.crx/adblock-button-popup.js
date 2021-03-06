
var backgroundPage = ext.backgroundPage.getWindow();
var require = backgroundPage.require;

var Filter = require('filterClasses').Filter;
var FilterStorage = require('filterStorage').FilterStorage;
var Prefs = require('prefs').Prefs;
var getBlockedPerPage = require('stats').getBlockedPerPage;
var getDecodedHostname = require('url').getDecodedHostname;

// the tab/page object, which contains |id| and |url| (stored as unicodeUrl) of
// the current tab
var page = null;
var pageInfo = null;
var activeTab = null;
$(function ()
{
  localizePage();

  var BG = chrome.extension.getBackgroundPage();

  // Set menu entries appropriately for the selected tab.
  $('.menu-entry, .menu-status, .separator').hide();
  BG.recordGeneralMessage("popup_opened");

  BG.getCurrentTabInfo(function (info)
  {
    // Cache tab object for later use
    page = info.page;
    pageInfo = info;
    var shown = {};
    function show(L)
    {
      L.forEach(function (x)
      {
        shown[x] = true;
      });
    }

    function hide(L)
    {
      L.forEach(function (x)
      {
        shown[x] = false;
      });
    }

    show(['div_options', 'separator2']);
    var paused = BG.adblockIsPaused();
    var domainPaused = BG.adblockIsDomainPaused({"url": page.unicodeUrl, "id": page.id});
    if (paused)
    {
      show(['div_status_paused', 'separator0', 'div_paused_adblock', 'div_options']);
    } else if (domainPaused)
    {
      show(['div_status_domain_paused', 'separator0', 'div_domain_paused_adblock', 'div_options']);
    } else if (info.disabledSite)
    {
      show(['div_status_disabled', 'separator0', 'div_pause_adblock', 'div_options']);
    } else if (info.whitelisted)
    {
      show(['div_status_whitelisted', 'div_enable_adblock_on_this_page', 'separator0', 'div_pause_adblock', 'separator1', 'div_options']);
    } else
    {
      show(['div_pause_adblock', 'div_domain_pause_adblock', 'div_blacklist', 'div_whitelist', 'div_whitelist_page', 'div_report_an_ad', 'separator3', 'separator4', 'div_options', 'block_counts']);

      $('#page_blocked_count').text(getBlockedPerPage(page).toLocaleString());
      $('#total_blocked_count').text(Prefs.blocked_total.toLocaleString());
    }

    var host = parseUri(page.unicodeUrl).host;
    var advancedOption = info.settings.show_advanced_options;
    var eligibleForUndo = !paused && !domainPaused && (info.disabledSite || !info.whitelisted);
    var urlToCheckForUndo = info.disabledSite ? undefined : host;
    if (eligibleForUndo && BG.countCache.getCustomFilterCount(urlToCheckForUndo))
    {
      show(['div_undo', 'separator0']);
    }

    if (SAFARI && !advanced_option) {
      hide(['div_report_an_ad', 'separator1']);
    }

    if (host === 'www.youtube.com' && /channel|user/.test(page.unicodeUrl) && /ab_channel/.test(page.unicodeUrl) && eligibleForUndo && info.settings.youtube_channel_whitelist)
    {
      $('#div_whitelist_channel').html(translate('whitelist_youtube_channel', parseUri.parseSearch(page.unicodeUrl).ab_channel));
      show(['div_whitelist_channel']);
    }

    if (chrome.runtime && chrome.runtime.id === 'pljaalgmajnlogcgiohkhdmgpomjcihk')
    {
      show(['div_status_beta']);
    }

    // In Safari with content blocking enabled,
    // whitelisting of domains is not currently supported.
    if (SAFARI && info.settings.safari_content_blocking)
    {
      hide(['div_paused_adblock', 'div_domain_paused_adblock', 'div_whitelist_page', 'div_whitelist']);
    }

    for (var div in shown)
    {
      if (shown[div])
      {
        $('#' + div).show();
      }
    }

    if (SAFARI || !Prefs.show_statsinpopup || paused || domainPaused || info.disabledSite || info.whitelisted)
    {
      $('#block_counts').hide();
    }
  });

  if (SAFARI)
  {
    // Update the width and height of popover in Safari
    $(window).load(function ()
    {
      var popupheight = $('body').outerHeight();
      safari.extension.popovers[0].height = popupheight + 5;
      safari.extension.popovers[0].width = 270;
    });

    // Store info about active tab
    activeTab = safari.application.activeBrowserWindow.activeTab;
  }

  // We need to reload popover in Safari, so that we could
  // update popover according to the status of AdBlock.
  // We don't need to reload popup in Chrome,
  // because Chrome reloads every time the popup for us.
  function closeAndReloadPopup()
  {
    if (SAFARI)
    {
      safari.self.hide();
      setTimeout(function ()
      {
        window.location.reload();
      }, 200);
    } else
    {
      window.close();
    }
  }

  // Click handlers
  $('#bugreport').click(function ()
  {
    BG.recordGeneralMessage("bugreport_clicked");
    var supportURL = 'https://help.getadblock.com/support/tickets/new';
    ext.pages.open(supportURL);
    closeAndReloadPopup();
  });

  $('#titletext').click(function ()
  {
    BG.recordGeneralMessage("titletext_clicked");
    var chrome_url = 'https://chrome.google.com/webstore/detail/gighmmpiobklfepjocnamgkkbiglidom';
    var opera_url = 'https://addons.opera.com/extensions/details/adblockforopera/';
    var getadblock_url = 'https://getadblock.com/';
    if (OPERA)
    {
      BG.ext.pages.open(opera_url);
    } else if (SAFARI)
    {
      BG.ext.pages.open(getadblock_url);
    } else
    {
      BG.ext.pages.open(chrome_url);
    }

    closeAndReloadPopup();
  });

  $('#div_enable_adblock_on_this_page').click(function ()
  {
    BG.recordGeneralMessage("enable_adblock_clicked");
    if (BG.tryToUnwhitelist(page.unicodeUrl))
    {
      !SAFARI ? chrome.tabs.reload() : activeTab.url = activeTab.url;
      closeAndReloadPopup();
    } else
    {
      $('#div_status_whitelisted').replaceWith(translate('disabled_by_filter_lists'));
    }
  });

  $('#div_paused_adblock').click(function ()
  {
    BG.recordGeneralMessage("unpause_clicked");
    BG.adblockIsPaused(false);
    BG.updateButtonUIAndContextMenus();
    closeAndReloadPopup();
  });

  $('#div_domain_paused_adblock').click(function ()
  {
    BG.recordGeneralMessage("domain_unpause_clicked");
    BG.adblockIsDomainPaused({"url": page.unicodeUrl, "id": page.id}, false);
    BG.updateButtonUIAndContextMenus();
    closeAndReloadPopup();
  });

  $('#div_undo').click(function ()
  {
    BG.recordGeneralMessage("undo_clicked");
    var host = parseUri(page.unicodeUrl).host;
    if (!SAFARI)
    {
      activeTab = page;
    }
    BG.confirmRemovalOfCustomFiltersOnHost(host, activeTab);
    closeAndReloadPopup();
  });

  $('#div_whitelist_channel').click(function ()
  {
    BG.recordGeneralMessage("whitelist_youtube_clicked");
    BG.createWhitelistFilterForYoutubeChannel(page.unicodeUrl);
    closeAndReloadPopup();
    !SAFARI ? chrome.tabs.reload() : activeTab.url = activeTab.url;
  });

  $('#div_pause_adblock').click(function ()
  {
    BG.recordGeneralMessage("pause_clicked");
    try
    {
      if (pageInfo.settings.safari_content_blocking)
      {
        alert(translate('safaricontentblockingpausemessage'));
      } else
      {
        BG.adblockIsPaused(true);
        BG.updateButtonUIAndContextMenus();
      }

      closeAndReloadPopup();
    }
    catch (ex)
    {
      BG.log(ex);
    }
  });

  $('#div_domain_pause_adblock').click(function ()
  {
    BG.recordGeneralMessage("domain_pause_clicked");
    BG.adblockIsDomainPaused({"url": page.unicodeUrl, "id": page.id}, true);
    BG.updateButtonUIAndContextMenus();
    closeAndReloadPopup();
  });

  $('#div_blacklist').click(function ()
  {
    BG.recordGeneralMessage("blacklist_clicked");
    if (!SAFARI)
    {
      BG.emitPageBroadcast({
        fn: 'top_open_blacklist_ui',
        options: {
          nothing_clicked: true,
        },
      }, {
        tab: page,
      } // fake sender to determine target page
      );
    } else
    {
      BG.dispatchMessage('show-blacklist-wizard');
    }

    closeAndReloadPopup();
  });

  $('#div_whitelist').click(function ()
  {
    BG.recordGeneralMessage("whitelist_domain_clicked");
    if (!SAFARI)
    {
      BG.emitPageBroadcast({
        fn: 'top_open_whitelist_ui',
        options: {},
      }, {
        tab: page,
      } // fake sender to determine target page
      );
    } else
    {
      BG.dispatchMessage('show-whitelist-wizard');
    }

    closeAndReloadPopup();
  });

  $('#div_whitelist_page').click(function ()
  {
    BG.recordGeneralMessage("whitelist_page_clicked");
    BG.createPageWhitelistFilter(page.unicodeUrl);
    closeAndReloadPopup();
    !SAFARI ? chrome.tabs.reload() : activeTab.url = activeTab.url;
  });

  $('#div_report_an_ad').click(function ()
  {
    BG.recordGeneralMessage("report_ad_clicked");
    var url = 'adblock-adreport.html?url=' + encodeURIComponent(page.unicodeUrl) + '&tabId=' + page.id;
    BG.ext.pages.open(BG.ext.getURL(url));
    closeAndReloadPopup();
  });

  $('#div_options').click(function ()
  {
    BG.recordGeneralMessage("options_clicked");
    BG.ext.pages.open(BG.ext.getURL('options.html'));
    closeAndReloadPopup();
  });

  $('#help_link').click(function ()
  {
    BG.recordGeneralMessage("feedback_clicked");
    BG.ext.pages.open("http://help.getadblock.com/");
    closeAndReloadPopup();
  });

  $('#link_open').click(function ()
  {
    BG.recordGeneralMessage("link_clicked");
    var linkHref = "https://getadblock.com/pay/?exp=7003&u=" + backgroundPage.STATS.userId();
    BG.ext.pages.open(linkHref);
    closeAndReloadPopup();
  });

});
