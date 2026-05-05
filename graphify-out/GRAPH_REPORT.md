# Graph Report - /Users/josh/schwung  (2026-05-05)

## Corpus Check
- 343 files · ~594,772 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 2694 nodes · 6484 edges · 32 communities detected
- Extraction: 82% EXTRACTED · 18% INFERRED · 0% AMBIGUOUS · INFERRED: 1179 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 33|Community 33]]

## God Nodes (most connected - your core abstractions)
1. `handleSelect()` - 101 edges
2. `print()` - 88 edges
3. `announce()` - 84 edges
4. `clear_screen()` - 79 edges
5. `getSlotParam()` - 62 edges
6. `drawHeader()` - 54 edges
7. `fill_rect()` - 52 edges
8. `drawFooter()` - 49 edges
9. `setView()` - 48 edges
10. `shim_pre_transfer()` - 47 edges

## Surprising Connections (you probably didn't know these)
- `shim_init_subsystems()` --calls--> `process_init()`  [INFERRED]
  schwung_shim.c → host/shadow_process.c
- `drawMasterFx()` --calls--> `isTextEntryActive()`  [INFERRED]
  shadow/shadow_ui_master_fx.mjs → shared/text_entry.mjs
- `preview_play()` --calls--> `Open()`  [INFERRED]
  schwung_shim.c → lib/jack2/shadow/JackShadowDriver.cpp
- `preview_play()` --calls--> `mmap()`  [INFERRED]
  schwung_shim.c → lib/schwung_spi_lib.c
- `overtake_midi_send_external()` --calls--> `shadow_log()`  [INFERRED]
  schwung_shim.c → host/shadow_chain_mgmt.c

## Communities

### Community 0 - "Community 0"
Cohesion: 0.02
Nodes (370): activateLedQueue(), adjustChainSetting(), adjustHierSelectedParam(), adjustKnobAndShow(), adjustLfoParam(), announceSavePreview(), applyComponentSelection(), applyComponentSelectionConfirmed() (+362 more)

### Community 1 - "Community 1"
Cohesion: 0.01
Nodes (260): host_log(), capture_apply_group(), capture_clear(), capture_debug_log(), capture_has_bit(), capture_has_cc(), capture_has_note(), capture_parse_json() (+252 more)

### Community 2 - "Community 2"
Cohesion: 0.03
Nodes (194): load_jpeg_image(), stbi__addints_valid(), stbi__addsizes_valid(), stbi__at_eof(), stbi__bit_reverse(), stbi__bitcount(), stbi__bitreverse16(), stbi__blinn_8x8() (+186 more)

### Community 3 - "Community 3"
Cohesion: 0.02
Nodes (109): JackRequest(), JackResult(), Read(), Size(), Write(), base64_encode(), client_remove(), handle_http() (+101 more)

### Community 4 - "Community 4"
Cohesion: 0.03
Nodes (170): drawComponentPicker(), drawComponentSelector(), drawConfirmDelete(), drawEditorOverview(), drawKnobEditor(), drawKnobParamPicker(), drawParamEditor(), drawSlotMenu() (+162 more)

### Community 5 - "Community 5"
Cohesion: 0.04
Nodes (140): bounded_strstr(), calc_knob_accel(), chain_get_clock_status(), chain_log(), chain_mod_alloc_target_entry(), chain_mod_apply_effective_value(), chain_mod_clampf(), chain_mod_clear_source() (+132 more)

### Community 6 - "Community 6"
Cohesion: 0.04
Nodes (137): js_display_glyph_ttf(), js_display_load_ttf_font(), equal(), main(), my_stbtt_initfont(), my_stbtt_print(), stbrp_init_target(), stbrp_pack_rects() (+129 more)

### Community 7 - "Community 7"
Cohesion: 0.03
Nodes (129): analytics_diff_modules(), analytics_enabled(), analytics_init(), analytics_set_enabled(), analytics_track(), find_in_snapshot(), generate_uuid_v4(), load_or_create_id() (+121 more)

### Community 8 - "Community 8"
Cohesion: 0.03
Nodes (95): Jack(), clearLEDs(), fillPads(), getOctaveDisplay(), getPadColor(), setupLedBatch(), updateStatusLine(), adjustParam() (+87 more)

### Community 9 - "Community 9"
Cohesion: 0.05
Nodes (90): link_audio_reset_state(), launch_link_subscriber(), launch_shadow_ui(), link_sub_kill(), link_sub_kill_orphans(), link_sub_monitor_main(), link_sub_now_ms(), link_sub_pid_alive() (+82 more)

### Community 10 - "Community 10"
Cohesion: 0.06
Nodes (60): buildChainJson(), createEditorState(), createEmptyKnobs(), deleteChain(), disableComponentHostRouting(), disableSourceHostRouting(), enableComponentHostRouting(), enableSourceHostRouting() (+52 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (46): announceBrowserFolder(), basename(), copyFile(), currentBrowserDir(), dirname(), doCopy(), doDelete(), doDuplicate() (+38 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (39): barLengthModeLabel(), countNonEmpty(), describeEntry(), drainInjectQueue(), drawStepParamsView(), ensureEntryExists(), ensureTrailingEmpty(), entryLabel() (+31 more)

### Community 13 - "Community 13"
Cohesion: 0.14
Nodes (30): tts_get_audio(), tts_get_enabled(), tts_get_engine(), tts_get_pitch(), tts_get_speed(), tts_get_volume(), tts_is_speaking(), tts_set_enabled() (+22 more)

### Community 14 - "Community 14"
Cohesion: 0.13
Nodes (27): font_cache_get(), font_cache_put(), js_display_bind_clear_screen(), js_display_bind_draw_image(), js_display_bind_draw_line(), js_display_bind_draw_rect(), js_display_bind_fill_circle(), js_display_bind_fill_rect() (+19 more)

### Community 15 - "Community 15"
Cohesion: 0.17
Nodes (21): biquad_process(), biquad_reset(), biquad_set_high_shelf(), biquad_set_highpass(), biquad_set_lowpass(), biquad_set_notch(), biquad_set_passthrough(), biquad_set_riaa_stage1() (+13 more)

### Community 16 - "Community 16"
Cohesion: 0.2
Nodes (20): chown_to_ableton(), count_uuid_dirs(), set_page_change_thread(), set_page_move_dirs(), set_page_persist(), set_page_read_persisted(), set_page_restore_xattrs(), set_page_save_xattrs() (+12 more)

### Community 17 - "Community 17"
Cohesion: 0.18
Nodes (14): arp_add_note(), arp_calc_clocks_per_step(), arp_calc_samples_per_step(), arp_get_next_note(), arp_get_param(), arp_get_sync_warning(), arp_process_midi(), arp_query_clock_status() (+6 more)

### Community 18 - "Community 18"
Cohesion: 0.22
Nodes (11): compareVersions(), ensureTmpDir(), fetchCatalog(), fetchReleaseJson(), getInstallSubdir(), getModuleStatus(), installModule(), isNewerVersion() (+3 more)

### Community 19 - "Community 19"
Cohesion: 0.26
Nodes (12): buildHierarchy(), fetchAndParseManual(), getFetchedTime(), isStale(), parseHtml(), processDownloadedHtml(), readManualJson(), refreshManualBackground() (+4 more)

### Community 20 - "Community 20"
Cohesion: 0.2
Nodes (8): jack_slist_alloc(), jack_slist_append(), jack_slist_copy(), jack_slist_free(), jack_slist_last(), jack_slist_remove(), jack_slist_sort(), jack_slist_sort_merge()

### Community 21 - "Community 21"
Cohesion: 0.24
Nodes (8): destroy_instance(), emit_note_off(), emit_step(), inject(), recompute_step_samples(), refresh_bpm(), render_block(), set_param()

### Community 22 - "Community 22"
Cohesion: 0.25
Nodes (12): allpass_init(), allpass_process(), comb_init(), comb_process(), json_get_float(), move_audio_fx_init_v2(), v2_create_instance(), v2_destroy_instance() (+4 more)

### Community 23 - "Community 23"
Cohesion: 0.24
Nodes (5): chord_process_midi(), chord_set_param(), json_get_int(), json_get_string(), queue_note()

### Community 25 - "Community 25"
Cohesion: 0.33
Nodes (7): confirmLineInput(), consumesLineInput(), feedbackGateDraw(), feedbackGateInput(), feedbackRiskPresent(), maybeConfirmForModule(), resolveGate()

### Community 26 - "Community 26"
Cohesion: 0.25
Nodes (2): json_get_int(), velocity_scale_set_param()

### Community 27 - "Community 27"
Cohesion: 0.36
Nodes (4): getParamTarget(), groupParamsByTarget(), parseParamKey(), stripParamPrefix()

### Community 28 - "Community 28"
Cohesion: 0.54
Nodes (7): applyDisplayFormat(), fmtHz(), fmtPercent(), fmtSemitones(), formatParamForSet(), formatParamValue(), precisionForStep()

### Community 29 - "Community 29"
Cohesion: 0.6
Nodes (4): GetShmAddress(), Init(), Jack(), SetShmIndex()

### Community 30 - "Community 30"
Cohesion: 0.5
Nodes (3): DEC_ATOMIC(), INC_ATOMIC(), CAS()

### Community 31 - "Community 31"
Cohesion: 0.83
Nodes (3): main(), read_cache(), write_cache()

### Community 33 - "Community 33"
Cohesion: 0.83
Nodes (3): jack_default_server_name(), jack_varargs_init(), jack_varargs_parse()

## Knowledge Gaps
- **Thin community `Community 26`** (9 nodes): `json_get_int()`, `move_midi_fx_init()`, `velocity_scale_create_instance()`, `velocity_scale_destroy_instance()`, `velocity_scale_get_param()`, `velocity_scale_process_midi()`, `velocity_scale_set_param()`, `velocity_scale_tick()`, `velocity_scale.c`
  Too small to be a meaningful cluster - may be noise or needs more connections extracted.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `unified_log()` connect `Community 9` to `Community 1`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.163) - this node is a cross-community bridge._
- **Why does `shim_init_subsystems()` connect `Community 1` to `Community 9`, `Community 13`?**
  _High betweenness centrality (0.117) - this node is a cross-community bridge._
- **Why does `print()` connect `Community 4` to `Community 0`, `Community 6`, `Community 7`, `Community 8`, `Community 12`?**
  _High betweenness centrality (0.113) - this node is a cross-community bridge._
- **Are the 20 inferred relationships involving `handleSelect()` (e.g. with `hideOverlay()` and `handleSlotsSelect()`) actually correct?**
  _`handleSelect()` has 20 INFERRED edges - model-reasoned connections that need verification._
- **Are the 83 inferred relationships involving `print()` (e.g. with `drawMainMenu()` and `drawMenu()`) actually correct?**
  _`print()` has 83 INFERRED edges - model-reasoned connections that need verification._
- **Are the 79 inferred relationships involving `announce()` (e.g. with `enterPatchBrowser()` and `enterPatchDetail()`) actually correct?**
  _`announce()` has 79 INFERRED edges - model-reasoned connections that need verification._
- **Are the 76 inferred relationships involving `clear_screen()` (e.g. with `drawSplash()` and `renderSettingsScreen()`) actually correct?**
  _`clear_screen()` has 76 INFERRED edges - model-reasoned connections that need verification._