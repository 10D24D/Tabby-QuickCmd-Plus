/**
 * QuickCommand+ 浮动面板组件
 * 功能描述：浮动在终端上的快捷命令面板，支持搜索/分组/执行/最小化/拖拽
 * 创建人：DD1024z + Deepseek-V4-Flash
 * 创建时间：2026-06-26
 * 修改人：DD1024z + Deepseek-V4.1-Flash
 * 修改时间：2026-10-24
 *   - 2026-10-28 (Deepseek-V4.1-Flash)：执行记录的「清空」改用面板内自绘确认框（原先用原生 window.confirm，
 *     与 SFTP+ 不一致且 Electron 焦点链不交还）；确认框层级抬到 2003/2004 以压过调用它的对话框；
 *     广播记录改为列出实际收到的每个连接（原先只写「N tabs」）
 *   - 2026-10-28 (Deepseek-V4.1-Flash)：广播写入改走 `tab.sendInput()`（宿主的 `Session.write(Buffer)` 内部
 *     `new Uint8Array(data)`，传字符串会写成空数组 ⇒ 静默丢弃）；右键菜单加 window 捕获兜底
 *     `_cmdContextCapture`（修饰键组合下元素级 contextmenu 绑定收不到事件）
 *   - 2026-10-28 (Deepseek-V4.1-Flash)：右键菜单层级改为「面板 z-index + 1」内联绑定（菜单是 .qc-panel
 *     的兄弟节点，写死 70 会被动态置顶的面板整块盖住 ⇒ 右键了却看不到菜单）
 *   - 2026-10-28 (Deepseek-V4.1-Flash)：新增「操作方式」（actionMode）：悬停操作按钮可按模式隐藏；
 *     右键菜单（执行/仅发送/广播到所有已连接标签/编辑/拷贝新建/固定/删除）+ 拷贝新建命令
 *     （保留参数与 SSH 关联，不继承快捷键/固定/次数）；菜单在「点任何位置」时关闭（window 捕获 mousedown）
 *   - 2026-10-24 (Deepseek-V4.1-Flash)：Shift+Enter 广播的标签枚举改为穿透分裂容器（`getAllTabs`），
 *     原先只按 `app.tabs` 的 `session` 过滤，分栏时得到 0 个已连接标签 ⇒ 静默 return、确认框不弹；
 *     并加诊断日志 + 枚举失败时退化为「当前标签确认」
 *   - 2026-10-24 (Deepseek-V4.1-Flash)：面板/弹窗阴影对齐 SFTP+（0 4px 16px/0.18、0 8px 32px/0.15，
 *     原 0.5×32px、0.4×48px 在深色终端上糊出明显暗边）；弹窗补 0.5px 描边保住边缘；
 *     执行记录连接列字号与时间一致、命令文本把换行渲染成 ⏎（原先单行省略号把换行吃掉）
 *   - 2026-10-24 (Deepseek-V4.1-Flash)：面板内回车语义统一（`runCmdFromPanelKey`）：固定快捷栏芯片
 *     原来绑了两次 keydown.enter 且直接 executeCommand（Tab 聚焦后回车会直接执行/重复发送），
 *     现与列表行、搜索框一致 —— 单独回车=仅发送、Ctrl/Cmd=执行、Alt=当前标签确认、Shift=广播
 *   - 2026-10-24 (Deepseek-V4.1-Flash)：执行记录列宽固定（时间/连接/名称三列 flex:0 0 Npx）+ 列序
 *     改为 时间→连接→名称→详情，两个筛选下拉同步换成 时间在前、连接在后
 *   - 2026-10-24 (Deepseek-V4.1-Flash)：「执行前确认」与「多步命令提示」合并为统一面板
 *     「命令执行确认」（新增命令名称行、按钮统一为 确定/取消，键盘代发与焦点靶点同步收口）
 *   - 2026-10-24 (Deepseek-V4.1-Flash)：弹窗内原生 <select> 全部换成自绘下拉（.qc-dd）——
 *     Electron 无边框窗口里点不开选项；执行记录空状态补文案（清空/筛选无结果两种）；补 --_content 定义
 *   - 2026-10-24 (Deepseek-V4.1-Flash)：弹窗打开时把 Enter/Esc 代发进弹窗（面板根 + 文档捕获两级），
 *     焦点多重试解决一次性 setTimeout 聚焦失效；仅发送（末尾无回车）后强制聚焦终端，
 *     修「回到面板 + 仅发送」反复弹确认框；执行记录补命令名快照并在历史列表显示
 *   - 2026-10-24 (Step-5-Preview)：新增「焦点策略」（focusAfterExec）：命令执行完毕后焦点可回到面板
 *     （保留原选中行，仅面板常驻时生效）；单标签发送/多步执行经 applyFocusAfterExec 收口，
 *     广播到多标签仍强制聚焦终端
 */
import { Component, OnInit, OnDestroy, ViewChild, ElementRef, Optional, Inject, ChangeDetectorRef } from '@angular/core'
import { ConfigService, LogService, AppService } from 'tabby-core'
import { QuickCommandService, QuickCommand, QuickCommandGroup, CommandStep, resolveSteps, QcExecRecord } from './qc-command.service'
import { QuickCommandI18nService } from './qc-i18n.service'

/**
 * 跨插件「刷新请求」事件名（本插件是发送侧）。
 * 契约唯一定义处：tabby-FTPS+/src/sftp/core/quickcmd-link.ts 的 QC_REFRESH_REQUEST_EVENT。
 * ⛔ 两个插件是各自独立的 webpack bundle、互不 import（任一方都可能没装），
 *   所以这里只能重复一份字面量 —— 改名必须两侧同步，否则链路静默断开。
 * @创建人：DD1024z + Deepseek-V4.1-Flash
 * @创建时间：2026-10-27
 */
export const QC_SFTP_REFRESH_EVENT = 'sftp-plus-refresh-request'

@Component({
  selector: 'qc-floating-panel',
  template: `
    <div class="qc-panel"
      [class.minimized]="minimized"
      [class.resizing]="resizing !== null"
      [style.left.px]="panelX"
      [style.top.px]="panelY"
      [style.width.px]="panelWidth"
      [style.height.px]="panelHeight || autoMaxHeight"
      [style.max-height.px]="panelHeight ? null : autoMaxHeight"
      [style.visibility]="panelReady ? 'visible' : 'hidden'"
      tabindex="0"
      (mousedown)="noBubble($event)"
      (keydown)="onPanelKeydown($event)">

      <!-- 标题栏（可拖拽；右键出「还原默认大小 / 默认位置」菜单） -->
      <div class="qc-titlebar"
        (mousedown)="startDrag($event)"
        (contextmenu)="onTitlebarContextMenu($event)">
        <!-- 标题固定为品牌名，不随语言本地化：与插件名 / 设置页菜单 / 关于页保持一致，
             也对齐 SFTP+ 面板标题的写法（SFTP+ 同样用固定品牌名，不翻译） -->
        <span class="qc-title">QuickCmd+</span>
        <span class="qc-ssh-label" *ngIf="sshHost">{{ sshHost }}</span>
        <div class="qc-title-actions">
          <span class="qc-action qc-action-settings" *ngIf="!hideSettingsEntry" title="{{ i18n.t('panel.settings') }}" (click)="onOpenSettings && onOpenSettings(); $event.stopPropagation()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </span>
          <!-- 排序模式切换（齿轮右侧）：拖拽顺序 → 名称 → 执行次数 循环；非「拖拽顺序」时图标高亮 -->
          <span class="qc-action qc-action-sort" [class.active]="sortMode !== 'manual'"
            title="{{ i18n.t('panel.sort') }}: {{ sortModeLabel }}"
            (click)="cycleSortMode(); $event.stopPropagation()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="m3 16 4 4 4-4"/><path d="M7 20V4"/><path d="M11 4h10"/><path d="M11 8h7"/><path d="M11 12h4"/>
            </svg>
          </span>
          <!-- 执行记录（时钟图标）：放在排序与图钉之间 -->
          <span class="qc-action qc-action-history" title="{{ i18n.t('panel.history') }}" (click)="openHistory(); $event.stopPropagation()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7v5l3 2"/>
            </svg>
          </span>
          <!-- tooltip 用 panel.pinPanel（面板常驻），与设置页同一文案；
               panel.pin/unpin 专指「钉到快捷入口」语义，只用于列表星标与芯片 ✕，勿在此复用 -->
          <span class="qc-action qc-action-pin" [class.active]="pinPanel" title="{{ i18n.t('panel.pinPanel') }}" (click)="togglePinPanel(); $event.stopPropagation()">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor" aria-hidden="true">
              <path d="M16 9V4h1c.55 0 1-.45 1-1s-.45-1-1-1H7c-.55 0-1 .45-1 1s.45 1 1 1h1v5c0 1.66-1.34 3-3 3v2h5.97v7l1 1 1-1v-7H19v-2c-1.66 0-3-1.34-3-3z"/>
            </svg>
          </span>
          <span class="qc-action qc-action-close" title="{{ i18n.t('panel.close') }}" (click)="doClose(); $event.stopPropagation()">&#x2715;</span>
        </div>
      </div>

      <!-- 搜索栏 + 分组筛选 -->
      <div class="qc-search" *ngIf="!minimized">
        <div class="qc-search-row">
          <!-- 分组筛选：自绘下拉。原生 <select> 在 Electron 无边框窗口下点击不弹出选项（平台级问题），
               改为面板内浮层，与书签/连接切换等浮层风格一致 -->
          <div class="qc-filter">
            <div class="qc-filter-btn" (click)="toggleFilterMenu($event)">
              <span class="qc-filter-text">{{ filterGroupLabel }}</span>
              <span class="qc-filter-clear" *ngIf="filterGroup"
                (click)="clearFilterGroup($event)" [title]="i18n.t('app.all_groups')">&#x2715;</span>
              <span class="qc-filter-caret">&#9662;</span>
            </div>
            <!-- mousedown 阻止冒泡：否则会被面板根的 noBubble 抢先收起，导致点选项无效 -->
            <div class="qc-filter-menu" *ngIf="filterMenuOpen" (mousedown)="$event.stopPropagation()">
              <div class="qc-filter-item" [class.active]="!filterGroup"
                (click)="chooseFilter('')">{{ i18n.t('app.all_groups') }}</div>
              <div class="qc-filter-item" [class.active]="filterGroup === '__auto__'"
                (click)="chooseFilter('__auto__')">{{ i18n.t('app.auto_filter') }}</div>
              <div class="qc-filter-item" *ngFor="let g of allGroups"
                [class.active]="filterGroup === (g.name || '__ungrouped__')"
                (click)="chooseFilter(g.name || '__ungrouped__')">{{ g.name || i18n.t('app.ungrouped') }}</div>
            </div>
          </div>
          <!-- 输入框与清除按钮同容器：✕ 绝对定位到输入框内部右端（原先是并排的独立元素，视觉上落在框外） -->
          <div class="qc-search-field">
            <input class="qc-search-input" type="text"
              [placeholder]="i18n.t('app.search')"
              [(ngModel)]="searchText"
              (input)="onSearch()"
              (keydown.enter)="runFirstCmdFromPanelKey($event)"
              (keydown.escape)="doClose()">
            <span class="qc-search-clear" *ngIf="searchText"
              (click)="searchText=''; onSearch(); $event.stopPropagation()"
              [title]="i18n.t('app.clear_search')">&#x2715;</span>
            <!-- 数字定位输入缓冲 + 分组锁定标记（#n = 已锁定第 n 个分组） -->
            <span class="qc-num-hint" *ngIf="numBuffer || groupLockNo !== null">
              <span *ngIf="groupLockNo !== null">#{{ groupLockNo }}</span><span *ngIf="numBuffer">&#x21B5; {{ numBuffer }}</span>
            </span>
          </div>
        </div>
      </div>

      <!-- 快速入口区（固定命令）——可拖拽排序 -->
      <div class="qc-quick-bar" *ngIf="!minimized && pinnedCommands.length > 0" (wheel)="onQuickBarWheel($event)">
        <div class="qc-quick-cmd" *ngFor="let pcmd of pinnedCommands"
          draggable="true"
          tabindex="0"
          [attr.data-qc-quick-id]="pcmd.id"
          (dragstart)="onQuickDragStart($event, pcmd)"
          (dragover)="onQuickDragOver($event)"
          (dragleave)="onQuickDragLeave($event)"
          (drop)="onQuickDrop($event, pcmd)"
          (dragend)="onQuickDragEnd()"
          (click)="executeCommand(pcmd)"
          (keydown.enter)="runCmdFromPanelKey(pcmd, $event)"
          (keydown.space)="runCmdFromPanelKey(pcmd, $event)" [title]="pcmd.text"
          (contextmenu)="onCmdContextMenu($event, pcmd)"
          [class.dragging]="quickDragId === pcmd.id"
          [class.drag-over-left]="quickDropId === pcmd.id && quickDropSide === 'left'"
          [class.drag-over-right]="quickDropId === pcmd.id && quickDropSide === 'right'">
          <span class="qc-quick-name">{{ pcmd.shortName || pcmd.name }}</span>
          <span class="qc-quick-remove" (click)="unpinQuick(pcmd); $event.stopPropagation()"
            [title]="i18n.t('panel.unpin')">&#x2715;</span>
        </div>
      </div>

      <!-- 命令列表（data-cols 由宽度决定：宽而矮时用多列填满横向空间） -->
      <div class="qc-list" *ngIf="!minimized" #listRef [attr.data-cols]="_cols" (scroll)="onListScroll()">
        <!-- 按分组渲染 -->
        <ng-container *ngFor="let group of displayGroups; let gi = index; trackBy: trackGroup">
          <div class="qc-group-header"
            [class.key-active]="isKeyActiveGroup(group.name)"
            [attr.data-group-name]="group.name"
            (click)="toggleGroup(group.name)"
            (contextmenu)="onGroupHeaderContextMenu($event, group.name)"
            (dragover)="$event.preventDefault()"
            [attr.draggable]="sortMode === 'manual' ? 'true' : null"
            (dragstart)="onGroupDragStart($event, group.name)"
            (dragend)="onGroupDragEnd()"
            (drop)="onGroupDrop($event, group.name)"
            (dragleave)="onDragLeave($event)">
            <span class="qc-group-arrow">{{ group.expanded ? '&#x25BC;' : '&#x25B6;' }}</span>
            <span class="qc-group-no">{{ gi + 1 }}</span>
            <span class="qc-group-name">{{ group.name || i18n.t('app.ungrouped') }}</span>
            <span class="qc-group-count">{{ getGroupCommands(group.name).length }}</span>
            <span class="qc-group-edit" (click)="showGroupRenameDialog(group.name); $event.stopPropagation()" [title]="i18n.t('group.rename')">&#x270E;</span>
            <span class="qc-group-del" (click)="deleteGroup(group.name); $event.stopPropagation()" [title]="i18n.t('group.delete')">&#x2212;</span>
            <span class="qc-group-add" (click)="addCommandToGroup(group.name); $event.stopPropagation()" [title]="i18n.t('panel.add')">+</span>
          </div>

          <!-- 分组下的命令 -->
          <div *ngIf="group.expanded" class="qc-cmd-group-body"
            (dragover)="onListDragOver($event)"
            (dragleave)="onListDragLeave($event)"
            (drop)="onListDrop($event, group.name)">
            <div *ngFor="let cmd of getGroupCommands(group.name); let ci = index" class="qc-cmd-row"
              [class.key-active]="isKeyActiveCmd(cmd)"
              [attr.data-cmd-id]="cmd.id"
              (click)="executeCommand(cmd)"
              (dblclick)="editCommand(cmd)"
              [class.highlighted]="highlightedId === cmd.id"
              (dragover)="onDragOver($event)"
              (dragleave)="onDragLeave($event)"
              (drop)="onDrop($event, cmd)"
              (contextmenu)="onCmdContextMenu($event, cmd)">
              <span class="qc-cmd-drag" [attr.draggable]="sortMode === 'manual' ? 'true' : null"
                (dragstart)="onDragStart($event, cmd)"
                (dragend)="onDragEnd($event)"
                [title]="sortMode === 'manual' ? i18n.t('panel.drag_reorder') : i18n.t('panel.sort_hint')">⋮⋮</span>
              <span class="qc-cmd-no">{{ (ci + 1) + '.' }}</span>
              <div class="qc-cmd-body">
                <span class="qc-cmd-name">{{ cmd.name }}</span>
                <span class="qc-cmd-preview" [title]="cmd.text">{{ getPreview(cmd) }}</span>
              </div>
              <!-- 操作按钮：仅在「悬停显示」或「两者都支持」时出现（仅右键菜单模式下不占位） -->
              <div class="qc-cmd-actions" *ngIf="actionMode !== 'menu'">
                <span class="qc-cmd-badge" *ngIf="cmd.params && cmd.params.length > 0" title="Has parameters">{{ getParamBadge(cmd) }}</span>
                <span class="qc-cmd-shortcut-badge" *ngIf="cmd.shortcut">{{ cmd.shortcut }}</span>
                <span class="qc-cmd-edit-btn" (click)="editCommand(cmd); $event.stopPropagation()" [title]="i18n.t('panel.edit')">&#x270E;</span>
                <span class="qc-cmd-del" (click)="deleteCommand(cmd); $event.stopPropagation()" [title]="i18n.t('panel.delete')">&#x2715;</span>
                <span class="qc-cmd-sendline" (click)="sendToLine(cmd); $event.stopPropagation()" [title]="i18n.t('panel.send_to_line')">&#x21E7;</span>
                <span class="qc-cmd-execute" (click)="executeAlways(cmd); $event.stopPropagation()" [title]="i18n.t('panel.send_and_exec')">&#x23CE;</span>
              </div>
              <span class="qc-cmd-pinbtn" (click)="togglePin(cmd); $event.stopPropagation()"
                [title]="cmd.pinned ? i18n.t('panel.unpin') : i18n.t('panel.pin')"
                [class.active]="cmd.pinned">&#x2605;</span>
            </div>
            <div class="qc-drop-end" [class.drag-over]="listDropOver"></div>
          </div>
        </ng-container>

        <!-- 空状态 -->
        <div class="qc-empty" *ngIf="filteredCommands.length === 0 && searchText">
          {{ i18n.t('app.noresults') }}
        </div>
        <div class="qc-empty" *ngIf="filteredCommands.length === 0 && !searchText && filterGroup === '__auto__'">
          {{ i18n.t('panel.no_auto_group') }}
        </div>
        <div class="qc-empty" *ngIf="filteredCommands.length === 0 && !searchText && filterGroup && filterGroup !== '__auto__'">
          {{ i18n.t('panel.empty_group') }}
        </div>
        <div class="qc-empty" *ngIf="filteredCommands.length === 0 && !searchText && !filterGroup">
          {{ i18n.t('panel.hint.search') }}
        </div>
      </div>

      <!-- 底部操作栏 -->
      <div class="qc-footer" *ngIf="!minimized">
        <span class="qc-add-btn" (click)="addCommand()">+ {{ i18n.t('panel.add') }}</span>
        <span class="qc-add-btn qc-add-group-btn" (click)="addNewGroup()">+ {{ i18n.t('group.add') }}</span>
        <span class="qc-usage-hint" *ngIf="selectedCount > 0">{{ selectedCount }} cmd</span>
      </div>

      <!-- 调整大小手柄 -->
      <div class="qc-resize-e"  (mousedown)="startResize($event, 'e')"></div>
      <div class="qc-resize-w"  (mousedown)="startResize($event, 'w')"></div>
      <div class="qc-resize-s"  (mousedown)="startResize($event, 's')"></div>
      <div class="qc-resize-n"  (mousedown)="startResize($event, 'n')"></div>
      <div class="qc-resize-se" (mousedown)="startResize($event, 'se')"></div>
      <div class="qc-resize-sw" (mousedown)="startResize($event, 'sw')"></div>
      <div class="qc-resize-ne" (mousedown)="startResize($event, 'ne')"></div>
      <div class="qc-resize-nw" (mousedown)="startResize($event, 'nw')"></div>
    </div>

    <!-- 标题栏右键菜单：还原默认大小 / 默认位置（fixed 定位，不受面板 overflow 影响） -->
    <div class="qc-title-menu" *ngIf="titleMenuOpen"
      [style.left.px]="titleMenuX" [style.top.px]="titleMenuY" [style.zIndex]="titleMenuZ"
      (mousedown)="$event.stopPropagation()">
      <div class="qc-title-menu-item" (click)="resetPanelSize()">{{ i18n.t('panel.reset_size') }}</div>
      <div class="qc-title-menu-item" (click)="resetPanelPosition()">{{ i18n.t('panel.reset_pos') }}</div>
    </div>

    <!-- 命令右键菜单（操作方式含「右键菜单」时启用；按鼠标位置 fixed 定位） -->
    <div class="qc-cmd-menu" *ngIf="cmdMenuOpen && cmdMenuCmd"
      [style.left.px]="cmdMenuX" [style.top.px]="cmdMenuY" [style.zIndex]="cmdMenuZ"
      (mousedown)="$event.stopPropagation()"
      (contextmenu)="$event.preventDefault(); $event.stopPropagation()">
      <div class="qc-cmd-menu-item" (click)="runFromCmdMenu('run')">{{ i18n.t('panel.send_and_exec') }}</div>
      <div class="qc-cmd-menu-item" (click)="runFromCmdMenu('send')">{{ i18n.t('panel.send_to_line') }}</div>
      <!-- 广播到所有已连接标签（与 Shift+Enter 同一动作，同样强制先确认） -->
      <div class="qc-cmd-menu-item" (click)="runFromCmdMenu('broadcast')">{{ i18n.t('panel.broadcast') }}</div>
      <div class="qc-cmd-menu-sep"></div>
      <div class="qc-cmd-menu-item" (click)="runFromCmdMenu('edit')">{{ i18n.t('panel.edit') }}</div>
      <!-- 「拷贝新建命令」：拿这条命令做原型，改一个变体最省事 -->
      <div class="qc-cmd-menu-item" (click)="runFromCmdMenu('duplicate')">{{ i18n.t('panel.duplicate') }}</div>
      <div class="qc-cmd-menu-item" (click)="runFromCmdMenu('pin')">
        {{ cmdMenuCmd.pinned ? i18n.t('panel.unpin') : i18n.t('panel.pin') }}
      </div>
      <div class="qc-cmd-menu-sep"></div>
      <div class="qc-cmd-menu-item qc-cmd-menu-danger" (click)="runFromCmdMenu('delete')">{{ i18n.t('panel.delete') }}</div>
    </div>

    <!-- 添加/编辑命令弹窗 -->
    <div class="qc-overlay" *ngIf="showEditModal"></div>
    <div class="qc-edit-modal" *ngIf="showEditModal" (click)="$event.stopPropagation()"
      (mousedown)="onModalMousedown($event)"
      (keydown)="$event.stopPropagation()"
      (keydown.escape)="closeEditModal(); $event.preventDefault(); $event.stopPropagation()">
      <button class="qc-modal-close" (click)="closeEditModal()" [title]="i18n.t('settings.cancel')">&#x2715;</button>
      <div class="qc-edit-title">{{ editCmd?.id ? i18n.t('settings.edit_cmd') : i18n.t('panel.add') }}</div>
      <div class="qc-edit-field">
        <label>{{ i18n.t('settings.name') }}</label>
        <input class="qc-edit-input" type="text" [(ngModel)]="editCmd.name" (keydown.enter)="saveEditCmd()" placeholder="e.g. git status" autofocus>
      </div>

      <!-- 简称：仅用于固定快捷入口（书签）显示，避免长名称把快捷条撑满 -->
      <div class="qc-edit-field">
        <label>{{ i18n.t('settings.short_name') }}</label>
        <input class="qc-edit-input" type="text" [(ngModel)]="editCmd.shortName" (keydown.enter)="saveEditCmd()"
          maxlength="16" [placeholder]="i18n.t('settings.short_name_hint')">
      </div>

      <!-- 命令步骤列表 -->
      <div class="qc-steps-label">{{ i18n.t('settings.text') }}</div>
      <div class="qc-step-row" *ngFor="let step of editCmdSteps; let i = index"
        (dragover)="onStepDragOver($event, i)"
        (dragleave)="onStepDragLeave($event)"
        (drop)="onStepDrop($event, i)"
        [class.dragging]="stepDragIdx === i"
        [class.qc-step-disabled]="step.enabled === false">
        <span class="qc-step-drag" draggable="true"
          (dragstart)="onStepDragStart($event, i)"
          (dragend)="onStepDragEnd($event)" [title]="i18n.t('panel.drag_reorder')">⋮⋮</span>
        <input class="qc-step-enabled" type="checkbox"
          [(ngModel)]="step.enabled" [title]="step.enabled !== false ? i18n.t('settings.disable_step') : i18n.t('settings.enable_step')">
        <span class="qc-step-type"
          (click)="step.type = (step.type === 'break' ? 'command' : 'break'); $event.stopPropagation()"
          [title]="step.type === 'break' ? i18n.t('settings.step_type_cmd') : i18n.t('settings.step_type_break')"
          [class.is-break]="step.type === 'break'">{{ step.type === 'break' ? '&#x26A0;' : '&#x25B6;' }}</span>
        <input class="qc-step-delay" type="number" min="0" max="60" step="0.2"
          [(ngModel)]="step.delaySeconds" [placeholder]="i18n.t('settings.delay_short')"
          [title]="i18n.t('settings.delay_hint')">
        <textarea class="qc-step-input" [(ngModel)]="step.text" rows="1"
          *ngIf="step.type !== 'break'" [placeholder]="(i18n.t('settings.step_placeholder') + ' ' + (i+1))"
          (input)="autoGrow($event)" (keydown.enter)="saveEditCmd()"></textarea>
        <span class="qc-step-break-label" *ngIf="step.type === 'break'">{{ i18n.t('settings.send_ctrlc') }}</span>
        <span class="qc-step-del" (click)="removeStep(i)">&#x2715;</span>
      </div>
      <div class="qc-step-actions">
        <span class="qc-step-add" (click)="addStep()">+ {{ i18n.t('settings.add_step') }}</span>
        <span class="qc-step-add qc-step-add-break" (click)="addBreakStep()">+ {{ i18n.t('settings.add_break') }}</span>
      </div>

      <div class="qc-edit-field" style="margin-top:8px;">
        <label>{{ i18n.t('settings.group') }}</label>
        <!-- 自绘下拉（原生 <select> 在面板浮层里点不开选项，见 .qc-dd 注释） -->
        <div class="qc-dd qc-dd-block">
          <div class="qc-dd-btn" (click)="toggleEditGroupMenu($event)">
            <span class="qc-dd-text">{{ editCmd.group || i18n.t('app.ungrouped') }}</span>
            <span class="qc-dd-caret">&#9662;</span>
          </div>
          <div class="qc-dd-menu" *ngIf="editGroupMenuOpen" (mousedown)="$event.stopPropagation()">
            <div class="qc-dd-item" [class.active]="!editCmd.group"
              (click)="chooseEditGroup('')">{{ i18n.t('app.ungrouped') }}</div>
            <ng-container *ngFor="let g of allGroups">
              <div class="qc-dd-item" *ngIf="g.name" [class.active]="editCmd.group === g.name"
                (click)="chooseEditGroup(g.name)">{{ g.name }}</div>
            </ng-container>
          </div>
        </div>
      </div>
      <div class="qc-edit-check">
        <label><input type="checkbox" [(ngModel)]="editCmd.appendCR"> {{ i18n.t('settings.append_cr') }}</label>
        <label><input type="checkbox" [(ngModel)]="editCmd.pinned"> {{ i18n.t('settings.pinned') }}</label>
        <label><input type="checkbox" [(ngModel)]="editCmd.confirmBeforeRun"> {{ i18n.t('settings.confirm_before_run') }}</label>
      </div>
      <!-- 单条命令的「执行后通知其它插件刷新列表」三态（缺省跟随全局设置）。
           放在勾选区下方独立一行：它是三选一，混进复选框行会被误读成「又一个勾选项」 -->
      <div class="qc-edit-notify">
        <span class="qc-edit-notify-label">{{ i18n.t('settings.notify_refresh') }}</span>
        <span class="qc-edit-notify-pill" [class.active]="!editCmd.notifyRefresh || editCmd.notifyRefresh === 'inherit'"
          (click)="editCmd.notifyRefresh = 'inherit'">{{ i18n.t('settings.notify_refresh_inherit') }}</span>
        <span class="qc-edit-notify-pill" [class.active]="editCmd.notifyRefresh === 'always'"
          (click)="editCmd.notifyRefresh = 'always'">{{ i18n.t('settings.notify_refresh_always') }}</span>
        <span class="qc-edit-notify-pill" [class.active]="editCmd.notifyRefresh === 'never'"
          (click)="editCmd.notifyRefresh = 'never'">{{ i18n.t('settings.notify_refresh_never') }}</span>
      </div>
      <div class="qc-usage-row" *ngIf="editCmd?.id && editCmd?.usageCount !== undefined">
        <span class="qc-usage-label">{{ i18n.t('settings.usage_count') }}: <strong>{{ editCmd.usageCount || 0 }}</strong></span>
        <span class="qc-usage-reset" (click)="onResetUsage()">{{ i18n.t('settings.reset') }}</span>
      </div>
      <div class="qc-edit-footer">
        <button class="qc-edit-btn qc-edit-btn-primary" (click)="saveEditCmd()">{{ i18n.t('settings.save') }}</button>
        <button class="qc-edit-btn" (click)="closeEditModal()">{{ i18n.t('settings.cancel') }}</button>
      </div>
    </div>

    <!-- 命令执行确认：把「执行前确认」与「多步命令提示」合并成同一个面板
         （用户要求统一命名与版式；两者都是"发出去之前让用户看一眼"的同一件事，
         以前分成两套标题/按钮/宽度，看起来像两个功能） -->
    <div class="qc-overlay" *ngIf="pendingConfirmCmd || showMultiStepHint" (click)="cancelCommandConfirm()"></div>
    <div class="qc-edit-modal qc-cmd-confirm-modal" *ngIf="pendingConfirmCmd || showMultiStepHint" tabindex="0"
      (click)="$event.stopPropagation()"
      (keydown.enter)="confirmCommandConfirm(); $event.preventDefault(); $event.stopPropagation()"
      (keydown.escape)="cancelCommandConfirm(); $event.preventDefault(); $event.stopPropagation()">
      <div class="qc-edit-title">{{ i18n.t('confirm.title') }}</div>
      <!-- 命令名称：确认前先看清是哪条命令（名称可能与实际内容不一致，故下方仍展示真实内容） -->
      <div class="qc-cmd-confirm-name" *ngIf="commandConfirmName" [title]="commandConfirmName">{{ commandConfirmName }}</div>
      <div class="qc-confirm-text">{{ commandConfirmMessage }}</div>
      <pre class="qc-confirm-cmd">{{ commandConfirmPreview }}</pre>
      <div class="qc-edit-footer">
        <button class="qc-edit-btn qc-edit-btn-primary" (click)="confirmCommandConfirm()">{{ i18n.t('settings.ok') }}</button>
        <button class="qc-edit-btn" (click)="cancelCommandConfirm()">{{ i18n.t('settings.cancel') }}</button>
      </div>
    </div>

    <!-- 参数输入弹窗 -->
    <div class="qc-overlay" *ngIf="showParamModal" (click)="closeParamModal()"></div>
    <div class="qc-edit-modal" *ngIf="showParamModal" (click)="$event.stopPropagation()"
      (keydown.escape)="closeParamModal(); $event.preventDefault(); $event.stopPropagation()">
      <div class="qc-edit-title">{{ paramModalCmd?.name || i18n.t('panel.param_hint') }}</div>
      <div class="qc-edit-field" *ngFor="let p of paramModalParams">
        <label>{{ p }}</label>
        <input class="qc-edit-input" type="text" [(ngModel)]="paramModalValues[p]"
          (keydown.enter)="confirmParamModal()" [placeholder]="i18n.t('panel.param_hint') + ': ' + p" autofocus>
      </div>
      <div class="qc-edit-footer">
        <button class="qc-edit-btn qc-edit-btn-primary" (click)="confirmParamModal()">{{ i18n.t('settings.ok') }}</button>
        <button class="qc-edit-btn" (click)="closeParamModal()">{{ i18n.t('settings.cancel') }}</button>
      </div>
    </div>

    <!-- 分组修改弹窗 -->
    <div class="qc-overlay" *ngIf="showGroupRename"></div>
    <div class="qc-edit-modal qc-group-modal" *ngIf="showGroupRename" (click)="$event.stopPropagation()"
      (keydown)="$event.stopPropagation()"
      (keydown.escape)="closeGroupRename(); $event.preventDefault(); $event.stopPropagation()">
      <button class="qc-modal-close" (click)="closeGroupRename()" [title]="i18n.t('settings.cancel')">&#x2715;</button>
      <div class="qc-group-modal-title">
        <span>{{ groupRenameIsNew ? i18n.t('group.add') : i18n.t('group.edit') }}</span>
      </div>

      <div class="qc-group-form-row">
        <div class="qc-group-form-col qc-group-form-name">
          <label class="qc-group-form-label">{{ i18n.t('group.name') }}</label>
          <input class="qc-edit-input" type="text" [(ngModel)]="groupRenameValue"
            (keydown.enter)="confirmGroupRename()" [placeholder]="i18n.t('group.name')" autofocus>
        </div>
        <div class="qc-group-form-col qc-group-form-order">
          <label class="qc-group-form-label">{{ i18n.t('group.order') }}</label>
          <input class="qc-edit-input" type="number" min="0" step="1" [(ngModel)]="groupRenameOrder"
            (keydown.enter)="confirmGroupRename()" placeholder="0">
        </div>
      </div>

      <div class="qc-group-form-section" *ngIf="availableProfiles.length > 0">
        <div class="qc-group-profiles-header">
          <label class="qc-group-form-label">{{ i18n.t('group.profiles') }}</label>
          <span class="qc-group-profiles-toggle"
            (click)="toggleAllProfiles(groupRenameProfileIds.length < availableProfiles.length)">
            {{ groupRenameProfileIds.length >= availableProfiles.length ? '\u2715 \u5168\u90E8\u53D6\u6D88' : '\u2714 \u5168\u90E8\u9009\u4E2D' }}
          </span>
        </div>
        <div class="qc-group-profiles-list">
          <div class="qc-group-profile-row" *ngFor="let p of availableProfiles; let pi = index"
            [class.selected]="groupRenameProfileIds.includes(p.id)"
            [class.last]="pi === availableProfiles.length - 1"
            (click)="toggleGroupProfile(p.id, !groupRenameProfileIds.includes(p.id))">
            <input type="checkbox"
              [ngModel]="groupRenameProfileIds.includes(p.id)"
              (ngModelChange)="toggleGroupProfile(p.id, $event)"
              [ngModelOptions]="{standalone: true}"
              (click)="$event.stopPropagation()">
            <div class="qc-group-profile-body">
              <span class="qc-group-profile-name">{{ p.name }}</span>
              <span class="qc-group-profile-conn" *ngIf="p.host">{{ p.host }}<ng-container *ngIf="p.port > 0">:{{ p.port }}</ng-container></span>
            </div>
          </div>
        </div>
        <div class="qc-group-profiles-footer">
          <span class="qc-group-profiles-count" *ngIf="groupRenameProfileIds.length > 0">
            {{ groupRenameProfileIds.length }} / {{ availableProfiles.length }} {{ i18n.t('group.profiles_selected') }}
          </span>
          <span class="qc-group-profiles-hint" *ngIf="groupRenameProfileIds.length === 0">
            {{ i18n.t('group.profiles_hint') }}
          </span>
        </div>
      </div>

      <div class="qc-group-form-section qc-group-form-empty" *ngIf="availableProfiles.length === 0">
        <span class="qc-empty-hint">{{ i18n.t('group.no_profiles') }}</span>
      </div>

      <div class="qc-edit-footer qc-group-footer">
        <button class="qc-edit-btn qc-edit-btn-primary" (click)="confirmGroupRename()">{{ i18n.t('settings.ok') }}</button>
        <button class="qc-edit-btn" (click)="closeGroupRename()">{{ i18n.t('settings.cancel') }}</button>
      </div>
    </div>

    <!-- #14 修复：自定义确认弹窗（替代原生 confirm）。
         层级必须高于**调用它的那个对话框**（如执行记录 2001）—— 遮罩 2003 / 弹窗 2004。 -->
    <div class="qc-overlay" *ngIf="showConfirmModal" (click)="cancelConfirmModal()" style="z-index:2003"></div>
    <div class="qc-edit-modal" *ngIf="showConfirmModal" (click)="$event.stopPropagation()"
      (keydown.escape)="cancelConfirmModal(); $event.preventDefault(); $event.stopPropagation()"
      style="min-width:420px; max-width:min(620px,92%); z-index:2004;">
      <div class="qc-edit-title">{{ confirmModalTitle }}</div>
      <!-- 删除命令时一并显示它会执行什么，避免只看名字误删 -->
      <pre class="qc-confirm-cmd" *ngIf="confirmModalDetail">{{ confirmModalDetail }}</pre>
      <div class="qc-edit-footer">
        <button class="qc-edit-btn qc-edit-btn-danger" autofocus (click)="doConfirmModal()">{{ i18n.t('settings.ok') }}</button>
        <button class="qc-edit-btn" (click)="cancelConfirmModal()">{{ i18n.t('settings.cancel') }}</button>
      </div>
    </div>

    <!-- 命令执行记录（仅本机，最近 200 条） -->
    <div class="qc-overlay" *ngIf="showHistory"></div>
    <div class="qc-edit-modal qc-history-modal" *ngIf="showHistory" (click)="$event.stopPropagation()" tabindex="0"
      (mousedown)="onModalMousedown($event)"
      (keydown.escape)="closeHistoryOrMenu(); $event.preventDefault(); $event.stopPropagation()"
      style="min-width:720px; max-width:min(920px,94%);">
      <button class="qc-modal-close" (click)="closeHistory()" [title]="i18n.t('settings.cancel')">&#x2715;</button>
      <div class="qc-edit-title">{{ i18n.t('panel.history') }}</div>
      <!-- 筛选：时间 + 连接（预设档位；选「自定义」才展开起止日期），顺序与下方列一致
           ⚠️ 一律用自绘下拉（.qc-dd），原生 <select> 在 Electron 无边框窗口的面板浮层里点不开选项
           （平台级问题，分组筛选早就换掉了；这里曾是漏网的旧写法） -->
      <div class="qc-history-filters">
        <div class="qc-dd">
          <div class="qc-dd-btn" (click)="toggleHistoryMenu('range', $event)">
            <span class="qc-dd-text">{{ historyRangeLabel }}</span>
            <span class="qc-dd-caret">&#9662;</span>
          </div>
          <div class="qc-dd-menu" *ngIf="historyMenu === 'range'" (mousedown)="$event.stopPropagation()">
            <div class="qc-dd-item" [class.active]="!historyRange"
              (click)="chooseHistoryRange('')">{{ i18n.t('panel.history_time_all') }}</div>
            <div class="qc-dd-item" [class.active]="historyRange === 'today'"
              (click)="chooseHistoryRange('today')">{{ i18n.t('panel.history_today') }}</div>
            <div class="qc-dd-item" [class.active]="historyRange === '7d'"
              (click)="chooseHistoryRange('7d')">{{ i18n.t('panel.history_7d') }}</div>
            <div class="qc-dd-item" [class.active]="historyRange === '30d'"
              (click)="chooseHistoryRange('30d')">{{ i18n.t('panel.history_30d') }}</div>
            <div class="qc-dd-item" [class.active]="historyRange === 'custom'"
              (click)="chooseHistoryRange('custom')">{{ i18n.t('panel.history_custom') }}</div>
          </div>
        </div>
        <div class="qc-dd">
          <div class="qc-dd-btn" (click)="toggleHistoryMenu('target', $event)">
            <span class="qc-dd-text">{{ historyTarget || i18n.t('panel.history_all') }}</span>
            <span class="qc-dd-caret">&#9662;</span>
          </div>
          <div class="qc-dd-menu" *ngIf="historyMenu === 'target'" (mousedown)="$event.stopPropagation()">
            <div class="qc-dd-item" [class.active]="!historyTarget"
              (click)="chooseHistoryTarget('')">{{ i18n.t('panel.history_all') }}</div>
            <div class="qc-dd-item" *ngFor="let tgt of historyTargets"
              [class.active]="historyTarget === tgt" [title]="tgt"
              (click)="chooseHistoryTarget(tgt)">{{ tgt }}</div>
          </div>
        </div>
        <ng-container *ngIf="historyRange === 'custom'">
          <input class="qc-history-date" type="date" [(ngModel)]="historyFrom" (mousedown)="$event.stopPropagation()">
          <span class="qc-history-sep">~</span>
          <input class="qc-history-date" type="date" [(ngModel)]="historyTo" (mousedown)="$event.stopPropagation()">
        </ng-container>
        <span class="qc-history-act" (click)="exportHistory()">{{ i18n.t('panel.history_export') }}</span>
        <span class="qc-history-act qc-history-act-danger" (click)="clearHistory()">{{ i18n.t('panel.history_clear') }}</span>
      </div>
      <div class="qc-history-list">
        <div class="qc-history-row" *ngFor="let r of filteredHistory">
          <!-- 列序固定：时间 → 连接 → 名称 → 详情（列宽在 CSS 里写死，长文本各自省略号） -->
          <span class="qc-history-time" [title]="formatRecordTime(r.ts)">{{ formatRecordTime(r.ts) }}</span>
          <span class="qc-history-target" [title]="r.target">{{ r.target || '\u2014' }}</span>
          <!-- 命令名称（执行时快照）：命令后来改名/删除也不影响这条历史；空 = 直接发送的文本 -->
          <span class="qc-history-name" [title]="r.name">{{ r.name || '\u2014' }}</span>
          <span class="qc-history-text" [title]="formatRecordText(r.text)">{{ formatRecordText(r.text) }}</span>
        </div>
        <!-- 空状态：有筛选条件时说「没有符合条件的记录」，清空后说「暂无执行记录」 -->
        <div class="qc-history-empty" *ngIf="filteredHistory.length === 0">{{ historyEmptyText }}</div>
      </div>
      <!-- 底部：条数 + 关闭（对齐 SFTP+ 传输记录的底部布局） -->
      <div class="qc-history-footer">
        <span class="qc-history-count">{{ i18n.t('panel.history_count', { n: filteredHistory.length }) }}</span>
        <button class="qc-edit-btn qc-edit-btn-primary" (click)="closeHistory()">{{ i18n.t('panel.close') }}</button>
      </div>
    </div>
  `,
  styles: [`
    :host { display: contents; }    /* 颜色主题变量放在 :host 上，确保面板内所有弹窗（如 .qc-edit-modal）都能继承 */
    :host {
      /* Auto（默认）回退色对齐 SFTP+ 的 Dark 预设：低饱和中性灰。
         原先用 Catppuccin 亮紫值（surface #313244 / hover #585b70 / primary #b4befe）会让面板
         比终端底色亮一档且整体泛紫，与 SFTP+ 的观感差很多。 */
      --_bg: var(--qc-bg, #1a1d23);
      --_text: var(--qc-text, #e8edf5);
      --_primary: var(--qc-primary, #b6b6c3);
      /* 强调色（开/关态图标、可点击文字、hover 反馈）：优先用户自选主色，其次取宿主 Tabby 主色。
         大面积色系已对齐 SFTP+ 的中性灰，但「强调」若也用灰白则完全看不出（图钉的开/关几乎无差别） */
      --_accent: var(--qc-primary, var(--primary-color, #b6b6c3));
      --_border: var(--qc-border, #2d3242);
      --_surface: var(--qc-surface, #252830);
      /* --_content：次级控件底色（导出/清空按钮、历史底部按钮）。此前只有使用方、没有定义，
         导致 background 解析失败退成透明（按钮看起来"没有底"）。统一指向 surface。 */
      --_content: var(--_surface);
      --_hover: var(--qc-hover, #2d3242);
      --_input-bg: var(--qc-input-bg, #1a1d23);
      --_text-muted: var(--qc-text-muted, #5a5f6f);
      --_text-secondary: #a6adc8;
      --_warning: #fab387;
    }
    .qc-panel {
      position: fixed;
      /* z-index 改为由 qc-terminal-decorator 通过共享计数器动态设置，避免硬编码压盖其它浮动面板 */
      width: 320px;
      box-sizing: border-box;
      background: var(--_bg);
      border: 0.5px solid var(--_border);
      border-radius: 10px;
      overflow: hidden;
      /* 阴影只用来和终端分界：取值对齐 SFTP+ 面板（0 4px 16px / 0.18）。
         原先 0 8px 32px / 0.5 在深色终端上会糊出一圈明显的暗边 */
      box-shadow: 0 4px 16px rgba(0,0,0,0.18);
      display: flex;
      flex-direction: column;
      user-select: none;
      font-size: var(--qc-font-size, 14px);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      /* 面板整体透明度，由设置页写入 --_panel-opacity（0.5–1） */
      opacity: var(--_panel-opacity, 1);
    }
    .qc-panel.minimized {
      width: auto;
      height: auto;
      box-shadow: none;
    }
    /* 调整大小手柄 */
    /* 四边四角 resize 手柄：加大命中区 + 提升层级。
       原为边 6px / 角 12px、z-index 1~2，footer 与列表滚动条会吞掉靠边点击 ⇒ 角落常拖不动。
       边条两端各缩进 8px，把角落让给角手柄，避免两者抢事件。 */
    .qc-resize-e, .qc-resize-w { position:absolute; top:8px; bottom:8px; width:8px; cursor:ew-resize; z-index:6; }
    .qc-resize-e { right:0; }
    .qc-resize-w { left:0; }
    .qc-resize-s, .qc-resize-n { position:absolute; left:8px; right:8px; height:8px; cursor:ns-resize; z-index:6; }
    .qc-resize-s { bottom:0; }
    .qc-resize-n { top:0; }
    .qc-resize-se, .qc-resize-sw, .qc-resize-ne, .qc-resize-nw { position:absolute; width:16px; height:16px; z-index:7; }
    .qc-resize-se { right:0; bottom:0; cursor:nwse-resize; }
    .qc-resize-sw { left:0; bottom:0; cursor:nesw-resize; }
    .qc-resize-ne { right:0; top:0; cursor:nesw-resize; }
    .qc-resize-nw { left:0; top:0; cursor:nwse-resize; }
    /* 标题栏 */
    .qc-titlebar {
      display: flex;
      align-items: center;
      padding: 6px 10px;
      background: var(--_surface, #45475a);
      cursor: move;
      flex-shrink: 0;
    }
    .qc-title { font-weight: 500; font-size: 1em; color: var(--_text, #e8edf5); }
    .qc-ssh-label { margin-left: 8px; font-size: .85em; color: var(--_text-muted, #5a5f6f); }
    .qc-title-actions { margin-left: auto; display: flex; gap: 4px; }
    .qc-action {
      cursor: pointer; padding: 2px 5px; font-size: 14px; line-height:1;
      color: var(--_text-muted, #5a5f6f); border-radius: 4px;
    }
    .qc-action:hover { background: rgba(255,255,255,0.1); color: var(--_text, #e8edf5); }
    .qc-action-close:hover { background: rgba(255,0,0,0.3); color: #f38ba8; }
    .qc-action-pin, .qc-action-settings, .qc-action-sort { display:flex; align-items:center; justify-content:center; width:20px; height:20px; padding:0; }
    .qc-action-pin svg, .qc-action-settings svg, .qc-action-sort svg { width:14px; height:14px; }
    /* 开/关态：强调色 + 淡底双重区分（只改颜色时，灰白强调色在深底上几乎看不出差异） */
    .qc-action-pin.active, .qc-action-sort.active {
      color: var(--_accent, #b6b6c3);
      background: rgba(127,127,127,0.22);
      border-radius: 4px;
    }
    .qc-action-pin:hover, .qc-action-settings:hover, .qc-action-sort:hover { background: rgba(255,255,255,0.1); }
    /* active 自带 hover 版本：通用 :hover 与 .active 特异性相同（0,2,0），只靠文件顺序会让淡底在悬停时消失 */
    .qc-action-pin.active:hover, .qc-action-sort.active:hover {
      color: var(--_accent, #b6b6c3);
      background: rgba(127,127,127,0.34);
    }
    /* 搜索栏 */
    .qc-search {
      /* 必须是 visible：分组下拉是绝对定位浮层，需要溢出搜索行才能显示；
         原来这里是 hidden，会把下拉菜单整条裁掉（只剩几像素，看起来像「点了没反应」） */
      padding: 6px 10px; flex-shrink: 0; overflow: visible;
    }
    .qc-search-row {
      display:flex; gap:4px; align-items:center; min-width:0;
    }
    /* 输入框容器：让清除按钮可以绝对定位到框内 */
    .qc-search-field { position:relative; flex:1; min-width:0; display:flex; }
    .qc-search-input {
      flex:1; width:100%; height:30px; padding: 0 24px 0 8px; min-width:0; box-sizing:border-box;
      background: var(--_input-bg, #1a1d23);
      border: 0.5px solid var(--_border, #2d3242);
      border-radius: 6px;
      color: var(--_text, #e8edf5); font-size: var(--qc-font-size, 14px); outline: none; caret-color:var(--_text);
    }
    .qc-search-input::placeholder { color: var(--_text-muted, #5a5f6f); }
    /* ✕ 置于输入框内部右端（padding-right 已留出 24px 空间） */
    .qc-search-clear {
      position:absolute; right:6px; top:50%; transform:translateY(-50%);
      cursor:pointer; color:var(--_text-muted,#5a5f6f); line-height:1; padding:0 2px;
      font-size: calc(var(--qc-font-size, 14px) - 1px);
    }
    .qc-search-clear:hover { color: var(--_text, #e8edf5); }

    /* 分组筛选 */
    /* 分组筛选（自绘下拉）：原生 <select> 在 Electron 无边框窗口下点不开，改用面板内浮层 */
    .qc-filter { position:relative; flex-shrink:0; }
    .qc-filter-btn {
      display:flex; align-items:center; gap:4px; height:30px; width:132px; flex-shrink:0; padding:0 8px; box-sizing:border-box;
      border-radius:6px; background:var(--_input-bg,#1a1d23); border:0.5px solid var(--_border,#2d3242);
      color:var(--_text,#e8edf5); font-size:var(--qc-font-size,14px); cursor:pointer; user-select:none;
    }
    .qc-filter-btn:hover { background:var(--_hover,#2d3242); }
    .qc-filter-text { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    /* 清除分组筛选（回到「全部分组」） */
    .qc-filter-clear {
      flex-shrink:0; font-size:11px; line-height:1; color:var(--_text-muted,#5a5f6f);
      padding:2px 3px; border-radius:3px; cursor:pointer;
    }
    .qc-filter-clear:hover { background:var(--_hover,#2d3242); color:var(--_text,#e8edf5); }
    .qc-filter-caret { font-size:10px; line-height:1; color:var(--_text-muted,#5a5f6f); flex-shrink:0; }
    .qc-filter-menu {
      position:absolute; top:calc(100% + 4px); left:0; min-width:168px; max-width:240px; max-height:180px;
      overflow-y:auto; padding:4px; z-index:40;
      /* 浮层比面板底（--_bg）亮一档，形成层次感；再配柔和投影 */
      background:var(--_surface,#252830); border:0.5px solid var(--_border,#2d3242); border-radius:8px;
      box-shadow:0 10px 28px rgba(0,0,0,.5), 0 0 0 .5px rgba(255,255,255,.04);
      animation: qc-menu-in .08s ease-out;
    }
    @keyframes qc-menu-in { from { opacity:0; transform:translateY(-2px); } to { opacity:1; transform:none; } }
    /* 细滚动条：系统默认滚动条在深色小浮层上又粗又亮，是"丑"的主要来源 */
    .qc-filter-menu::-webkit-scrollbar { width:8px; }
    .qc-filter-menu::-webkit-scrollbar-track { background:transparent; }
    .qc-filter-menu::-webkit-scrollbar-thumb {
      background:rgba(255,255,255,.14); border-radius:4px;
      border:2px solid transparent; background-clip:padding-box;
    }
    .qc-filter-menu::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,.26); background-clip:padding-box; }
    .qc-filter-item {
      position:relative; padding:6px 10px; border-radius:6px; font-size:var(--qc-font-size,14px);
      color:var(--_text,#e8edf5); cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .qc-filter-item:hover { background:var(--_hover,#2d3242); }
    /* 选中项：强调色文字 + 淡底 + 左侧竖条（只变色在深底上不够明显） */
    .qc-filter-item.active { color:var(--_accent,#b6b6c3); background:rgba(127,127,127,.14); }
    .qc-filter-item.active::before {
      content:''; position:absolute; left:3px; top:7px; bottom:7px; width:2px;
      border-radius:1px; background:var(--_accent,#b6b6c3);
    }
    /* 标题栏右键菜单（还原默认大小/位置）：面板内浮层，层级低于模态 2000 */
    /* 命令右键菜单：与标题栏菜单同一套观感。
       ⛔ 这里不写 z-index —— 菜单是 .qc-panel 的兄弟节点，层级必须按「面板当前 z-index + 1」
       内联绑定（见组件 cmdMenuZ），写死任何值都会被动态置顶的面板盖住。 */
    .qc-cmd-menu {
      position:fixed; min-width:172px; padding:4px;
      background:var(--_surface,#252830); border:0.5px solid var(--_border,#2d3242);
      border-radius:8px; box-shadow:0 10px 28px rgba(0,0,0,.45);
      animation: qc-menu-in .08s ease-out;
      /* 与面板统一透明度（菜单是兄弟节点，不继承面板的 opacity） */
      opacity: var(--_panel-opacity, 1);
    }
    .qc-cmd-menu-item {
      padding:6px 10px; border-radius:6px; font-size:var(--qc-font-size,14px);
      color:var(--_text,#e8edf5); cursor:pointer; white-space:nowrap;
    }
    .qc-cmd-menu-item:hover { background:var(--_hover,#2d3242); }
    .qc-cmd-menu-sep { height:1px; margin:4px 6px; background:var(--_border,#2d3242); }
    .qc-cmd-menu-danger:hover { background:rgba(226,75,74,.16); color:#e24b4a; }
    .qc-title-menu {
      position:fixed; z-index:1999; min-width:168px; padding:4px;
      background:var(--_surface,#252830); border:0.5px solid var(--_border,#2d3242);
      border-radius:8px; box-shadow:0 10px 28px rgba(0,0,0,.5);
      animation: qc-menu-in .08s ease-out;
      /* 与面板统一透明度 */
      opacity: var(--_panel-opacity, 1);
    }
    .qc-title-menu-item {
      padding:6px 10px; border-radius:6px; font-size:var(--qc-font-size,14px);
      color:var(--_text,#e8edf5); cursor:pointer; white-space:nowrap;
    }
    .qc-title-menu-item:hover { background:var(--_hover,#2d3242); }
    /* 键盘导航：面板根可聚焦但不要焦点轮廓；选中行用「淡底 + 左侧强调条」与鼠标 hover 区分 */
    .qc-panel:focus { outline: none; }
    .qc-cmd-row.key-active,
    .qc-group-header.key-active {
      background: var(--_hover, #2d3242);
      box-shadow: inset 2px 0 0 var(--_accent, #b6b6c3);
    }
    /* 自动编号：分组 1 / 组内命令 1.1（等宽数字、弱化色，不抢视觉） */
    .qc-group-no, .qc-cmd-no {
      font-size: calc(var(--qc-font-size, 14px) - 3px);
      color: var(--_text-muted, #5a5f6f);
      font-variant-numeric: tabular-nums;
      flex-shrink: 0;
    }
    .qc-group-no { min-width: 14px; text-align: right; margin-right: 2px; }
    .qc-cmd-no { min-width: 18px; text-align: right; margin-right: 4px; }
    /* 数字定位输入缓冲提示（贴在搜索框右侧内部，不挡 ✕ 按钮） */
    .qc-num-hint {
      position: absolute; right: 26px; top: 50%; transform: translateY(-50%);
      font-size: calc(var(--qc-font-size, 14px) - 3px); color: var(--_accent, #b6b6c3);
      background: var(--_surface, #252830); padding: 1px 4px; border-radius: 3px;
      pointer-events: none;
    }
    /* 快捷入口 */
    .qc-quick-bar {
      display: flex; gap: 4px; padding: 0 10px 6px; flex-shrink: 0;
      overflow-x: auto;
    }
    .qc-quick-cmd {
      position:relative; flex-shrink: 0; padding: 3px 16px 3px 10px; border-radius: 6px;
      background: var(--_surface, #e5e7eb);
      /* 描边用 --_border 而不是 --_primary：芯片是常驻元素，亮灰描边（#b6b6c3）在深色面板上会
         连成一排高亮白框，看着像"全部选中"。分隔靠底色比面板亮一档即可，hover 再把描边提一档。 */
      border: 0.5px solid var(--_border, #2d3242);
      cursor: pointer; white-space: nowrap; overflow:hidden; text-overflow:ellipsis; max-width:160px;
    }
    /* 芯片上的 ✕：hover 才显示，直接取消固定（免去回列表里找星标） */
    /* 芯片上的 ✕：悬停 600ms 后才显形，避免鼠标滑过时误点直接把命令取消固定。
       注意 opacity:0 的元素仍可点击 ⇒ 必须同时用 visibility 延迟隐藏，
       否则「看不见但点得到」正是误操作的根源。 */
    .qc-quick-remove {
      position:absolute; right:3px; top:50%; transform:translateY(-50%);
      font-size:10px; line-height:1; color:var(--_text-muted,#5a5f6f);
      padding:1px 2px; border-radius:3px;
      opacity:0; visibility:hidden;
      /* 移出时立即隐藏 */
      transition: opacity .12s ease, visibility 0s linear 0s;
    }
    .qc-quick-cmd:hover .qc-quick-remove {
      opacity:1; visibility:visible;
      /* 悬停 600ms 后再显形（含淡入 120ms，约 0.72s 后完全可见） */
      transition: opacity .12s ease .6s, visibility 0s linear .6s;
    }
    .qc-quick-remove:hover { color:#e24b4a; background:rgba(226,75,74,0.15); }
    .qc-quick-cmd:hover { background: var(--_hover, #2d3242); border-color: var(--_text-muted, #5a5f6f); }
    /* 快捷入口拖拽排序：源条目半透明，落点用竖向 3px 线表示（横向布局，故线与列表的横线区分开） */
    .qc-quick-cmd.dragging { opacity: .4; }
    .qc-quick-cmd.drag-over-left { box-shadow: -3px 0 0 0 var(--_primary, #b6b6c3); }
    .qc-quick-cmd.drag-over-right { box-shadow: 3px 0 0 0 var(--_primary, #b6b6c3); }
    .qc-quick-name { font-size: var(--qc-font-size, 14px); color: var(--_text, #e8edf5); font-weight: 500; }
    /* 命令列表 */
    .qc-list {
      flex: 1; overflow-y: auto; overflow-x: hidden;
      padding: 2px 0; min-width:0;
    }
    .qc-group-header {
      display: flex; align-items: center; gap: 4px; padding: 4px 10px 4px 6px;
      cursor: pointer; font-size: .92em;
      box-sizing: border-box; width: 100%;
    }
    .qc-group-header:hover { background: var(--_hover, rgba(255,255,255,0.05)); }
    .qc-group-header.drag-over { border-top: 2px solid var(--_primary, #b6b6c3); }
    .qc-group-header.drag-over-bottom { border-bottom: 2px solid var(--_primary, #b6b6c3); }
    .qc-group-arrow { font-size: calc(var(--qc-font-size, 14px) - 2px); color: var(--_text-muted, #5a5f6f); width: 16px; flex-shrink:0; text-align:center; }
    .qc-group-name { font-weight: 500; color: var(--_text-secondary, #a6adc8); }
    .qc-group-count { color: var(--_text-muted, #5a5f6f); font-size: calc(var(--qc-font-size, 14px) - 2px); }
    .qc-group-add {
      margin-left: auto; cursor: pointer; font-size: var(--qc-font-size, 14px); font-weight: 600;
      color: var(--_text, #e8edf5); opacity:1; padding: 0 4px; line-height: 1;
      border-radius: 3px; visibility: hidden;
    }
    .qc-group-header:hover .qc-group-add { visibility: visible; }
    .qc-group-add:hover { color: var(--_on-primary, #1e1e2e); background: var(--_primary, #b6b6c3); }
    .qc-group-edit {
      cursor: pointer; font-size: var(--qc-font-size, 14px); color: var(--_text, #e8edf5); opacity:1;
      padding: 0 3px; border-radius: 3px; visibility: hidden;
    }
    .qc-group-header:hover .qc-group-edit { visibility: visible; }
    .qc-group-edit:hover { color: var(--_on-primary, #1e1e2e); background: var(--_primary, #b6b6c3); }
    .qc-group-del { cursor:pointer; font-size:var(--qc-font-size, 14px); color:var(--_text, #e8edf5); opacity:1; padding:0 3px; border-radius:3px; visibility:hidden; }
    .qc-group-header:hover .qc-group-del { visibility:visible; }
    .qc-group-del:hover { color:#fff; background:#e24b4a; }
    /* 命令行 */
    .qc-cmd-row {
      display: flex; align-items: center; gap: 4px;
      padding: 7px 10px 7px 6px; cursor: pointer; border-radius: 0;
      width: 100%; box-sizing: border-box; overflow: hidden;
    }
    .qc-cmd-row:hover, .qc-cmd-row.highlighted { background: var(--_hover, rgba(255,255,255,0.1)); }
    .qc-cmd-row { position: relative; }
    /* 拖拽位置指示线：使用绝对定位，不影响布局 */
    .qc-cmd-row.drag-over::before,
    .qc-cmd-row.drag-over-bottom::after {
      content: '';
      position: absolute;
      left: 0; right: 0; height: 3px;
      background: var(--_primary, #b6b6c3);
      border-radius: 2px;
      z-index: 10;
      pointer-events: none;
    }
    .qc-cmd-row.drag-over::before { top: -1px; }
    .qc-cmd-row.drag-over-bottom::after { bottom: -1px; }
    .qc-cmd-row.dragging { opacity: 0.4; }
    /* 拖拽时禁用 hover 背景色，防止重绘导致抖动 */
    .qc-list.is-dragging .qc-cmd-row:hover { background: transparent !important; }
    .qc-cmd-group-body { position:relative; overflow-x: hidden; width: 100%; max-width: 100%; box-sizing: border-box; }
    /* 宽而矮：命令用 grid auto-fill 自动分列（每列 ≥240px），面板越宽列数越多，横向空间用满。
       不用 column-count —— 固定高度的滚动容器里多列会向右溢出而不是纵向滚动。 */
    .qc-list[data-cols="multi"] .qc-cmd-group-body {
      display:grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
      column-gap:8px; align-content:flex-start;
    }
    .qc-list[data-cols="multi"] .qc-cmd-body { min-width:0; }
    .qc-list[data-cols="multi"] .qc-cmd-group-body > .qc-drop-end { grid-column: 1 / -1; }
    /* 列表末尾的追加（drop）区：只保留不可见的命中区，用于把命令拖到最末尾 / 空分组。
       刻意不画任何指示线 —— 无论实心长条还是虚线，都会被误认成横向滚动条或多余装饰。 */
    /* 平时不占高度（否则每个分组末尾都多出 8px，看起来像"组间距过大"）；
       仅在拖拽过程中恢复 8px 命中区，用来把命令拖到组末尾 / 空分组。 */
    .qc-drop-end { height: 0; margin: 0; background: transparent; }
    .qc-list.is-dragging .qc-drop-end { height: 8px; }
    .qc-drop-end.drag-over { background:transparent; }
    .qc-cmd-drag {
      font-size: 11px; color: var(--_text-muted, #5a5f6f); cursor: grab; flex-shrink: 0;
      width: 14px; text-align: center; user-select: none;
    }
    .qc-cmd-drag:active { cursor: grabbing; }
    .qc-cmd-icon { font-size: 8px; flex-shrink: 0; width: 10px; overflow: hidden; text-align: center; }
    .qc-cmd-body { flex: 1; min-width: 0; overflow: hidden; }
    .qc-cmd-name { display: block; font-size: .92em; color: var(--_text, #e8edf5); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qc-cmd-preview { display: block; font-size: .77em; color: var(--_text-muted, #5a5f6f); font-family: monospace; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .qc-cmd-badge { font-size: calc(var(--qc-font-size, 14px) - 3px); padding: 1px 4px; border-radius: 3px; background: var(--_warning, #fab387); color: #1e1e2e; }
    .qc-cmd-shortcut-badge { font-size: calc(var(--qc-font-size, 14px) - 3px); padding: 1px 4px; border-radius: 3px; background: var(--_surface, #45475a); color: var(--_text-muted, #5a5f6f); font-family: monospace; }
    .qc-cmd-execute { font-size: calc(var(--qc-font-size, 14px) + 1px); color: var(--_text, #e8edf5); cursor: pointer; }
    .qc-cmd-edit-btn { font-size: var(--qc-font-size, 14px); color: var(--_text, #e8edf5); cursor: pointer; margin-right: 2px; }
    .qc-cmd-row:hover .qc-cmd-pinbtn { visibility:visible; opacity:1; }
    .qc-cmd-edit-btn:hover { color: var(--_accent, #b6b6c3); }
    .qc-cmd-execute:hover { color: var(--_accent, #b6b6c3); }
    .qc-cmd-sendline { font-size: var(--qc-font-size, 14px); color: var(--_text, #e8edf5); cursor: pointer; padding: 0 1px; }
    .qc-cmd-sendline:hover { color: var(--_accent, #b6b6c3); }
    .qc-cmd-pinbtn { font-size: var(--qc-font-size, 14px); cursor: pointer; flex-shrink: 0; padding: 0 3px; color: var(--_text, #e8edf5); visibility:hidden; opacity:0; transition:opacity .12s; }
    .qc-cmd-pinbtn:hover { color: var(--_accent, #b6b6c3); }
    .qc-cmd-pinbtn.active { color: var(--_accent, #b6b6c3); visibility:visible; opacity:1; }
    .qc-cmd-del { font-size: var(--qc-font-size, 14px); color: var(--_text, #e8edf5); cursor: pointer; padding:0 2px; }
    .qc-cmd-del:hover { color:#e24b4a; }
    /* 右侧操作按钮容器：默认收起不占宽度，hover 展开 */
    .qc-cmd-actions {
      display: flex; gap: 4px; flex-shrink: 0;
      max-width: 0; min-width: 0; width: 0; overflow: hidden; opacity: 0;
      transition: max-width .12s ease, opacity .12s ease;
    }
    .qc-cmd-row:hover .qc-cmd-actions { max-width: 200px; width: auto; opacity: 1; }
    /* 拖拽时强制收起操作按钮，防止多个行同时展开导致横向溢出 */
    .qc-cmd-row.dragging .qc-cmd-actions,
    .qc-list.is-dragging .qc-cmd-actions {
      max-width: 0 !important; min-width: 0 !important; width: 0 !important; opacity: 0 !important;
      transition: none !important;
      display: none !important;
    }
    .qc-list.is-dragging .qc-cmd-pinbtn:not(.active) {
      visibility: hidden !important; opacity: 0 !important;
    }
    /* 空状态 */
    .qc-empty { padding: 20px; text-align: center; color: var(--_text-muted, #5a5f6f); font-size: var(--qc-font-size, 14px); }
    /* 底部 */
    .qc-footer {
      display: flex; align-items: center; padding: 4px 10px;
      border-top: 0.5px solid var(--_border, #45475a); flex-shrink: 0;
    }
    .qc-add-btn { font-size: var(--qc-font-size, 14px); color: var(--_accent, #b6b6c3); cursor: pointer; padding: 2px 4px; }
    .qc-add-btn:hover { text-decoration: underline; }
    .qc-add-group-btn { margin-left: 8px; font-size: var(--qc-font-size, 14px); color: var(--_text-muted, #5a5f6f); }
    .qc-add-group-btn:hover { text-decoration: underline; color: var(--_accent, #b6b6c3); }
    .qc-usage-hint { margin-left: auto; font-size: calc(var(--qc-font-size, 14px) - 2px); color: var(--_text-muted, #5a5f6f); }

    /* 编辑弹窗 */
    /* 模态层：必须高于面板内所有浮层（分组下拉 40、缩放手柄 7 等），
       并给「后出现的确认框」留出更高一档（2002 > 2001），避免后弹的框被先弹的盖住 */
    .qc-overlay { position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:2000; }
    .qc-edit-modal {
      position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
      /* 阴影变轻后靠 0.5px 描边保住边缘（与 SFTP+ 的 .dialog 同做法） */
      background:var(--_bg); border:0.5px solid var(--_border); border-radius:12px; padding:20px; z-index:2001;
      min-width:580px; max-width:90%;
      /* 对齐 SFTP+ 的对话框阴影（0 8px 32px / 0.15） */
      box-shadow:0 8px 32px rgba(0,0,0,0.15);
      /* 与面板统一透明度：变量写在组件宿主上，弹窗是宿主的子元素，可以直接继承 */
      opacity: var(--_panel-opacity, 1);
    }
    .qc-edit-title { font-weight:500; font-size:calc(var(--qc-font-size, 14px) + 1px); color:var(--_text); margin-bottom:12px; display:flex; align-items:center; gap:8px; }
    .qc-usage-badge { font-size:calc(var(--qc-font-size, 14px) - 3px); opacity:.5; font-weight:400; }
    .qc-usage-row { display:flex; align-items:center; gap:8px; margin-top:8px; font-size:calc(var(--qc-font-size, 14px) - 2px); color:var(--_text-muted); }
    .qc-usage-label strong { color:var(--_text); }
    .qc-usage-reset { cursor:pointer; color:var(--_warning); font-size:calc(var(--qc-font-size, 14px) - 2px); padding:1px 6px; border-radius:4px; }
    .qc-usage-reset:hover { background:rgba(250,179,135,0.12); }
    .qc-edit-field { margin-bottom:8px; }
    .qc-edit-field label { display:block; font-size:calc(var(--qc-font-size, 14px) - 2px); color:var(--_text-muted); margin-bottom:3px; }
    .qc-edit-input {
      width:100%; padding:7px 8px; border-radius:6px; box-sizing:border-box;
      background:var(--_input-bg); border:0.5px solid var(--_border);
      color:var(--_text); font-size:var(--qc-font-size, 14px); outline:none; caret-color:var(--_text);
    }
    .qc-edit-input:focus { border-color:var(--_accent); }
    .qc-edit-footer { display:flex; gap:6px; justify-content:flex-end; margin-top:12px; }
    /* 命令执行确认（执行前确认 + 多步拼接提示 合并后的统一面板）
       层级比编辑弹窗高一档（后弹的不被先弹的盖住）；命令可能很长 ⇒ 给足宽度与预览高度，
       但 min-width 必须显式覆盖基础 .qc-edit-modal 的 580px，否则 max-width 会被 min 压过。 */
    .qc-cmd-confirm-modal { min-width: 460px; max-width: min(680px, 92%); z-index: 2002; }
    /* 命令名称：确认前先看清是哪条命令（放在说明上方，强调色 + 单行省略） */
    .qc-cmd-confirm-name {
      margin: 0 0 6px; font-size: calc(var(--qc-font-size, 14px) + 1px); font-weight: 500;
      color: var(--_accent, #b6b6c3); white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    }
    .qc-confirm-text { font-size: calc(var(--qc-font-size, 14px) - 1px); color: var(--_text-muted, #5a5f6f); margin: 2px 0 8px; }
    .qc-confirm-cmd {
      margin: 0 0 12px; padding: 10px 12px; max-height: 45vh; overflow: auto;
      background: var(--_input-bg, #1a1d23); border: 0.5px solid var(--_border, #2d3242); border-radius: 6px;
      font-family: monospace; font-size: calc(var(--qc-font-size, 14px) - 2px); color: var(--_text, #e8edf5);
      white-space: pre-wrap; word-break: break-all; line-height: 1.55;
    }
    .qc-confirm-cmd::-webkit-scrollbar { width: 8px; }
    .qc-confirm-cmd::-webkit-scrollbar-track { background: transparent; }
    .qc-confirm-cmd::-webkit-scrollbar-thumb {
      background: rgba(255,255,255,.14); border-radius: 4px;
      border: 2px solid transparent; background-clip: padding-box;
    }

    /* 命令执行记录 */
    .qc-history-list {
      max-height: 45vh; overflow: auto; display: flex; flex-direction: column;
      gap: 1px; margin-bottom: 12px;
    }
    .qc-history-row {
      display: flex; align-items: baseline; gap: 8px; padding: 3px 6px; border-radius: 4px;
      font-size: var(--qc-font-size, 14px);
    }
    .qc-history-row:hover { background: var(--_hover, #2d3242); }
    /* 列宽写死（flex: 0 0 Npx），否则各列按内容宽度伸缩 ⇒ 行与行对不齐。
       长文本一律单行省略号 + title 看全；最后一列（详情）吃剩余宽度。 */
    .qc-history-time {
      flex: 0 0 152px; width: 152px; color: var(--_text-muted, #5a5f6f);
      font-variant-numeric: tabular-nums; font-size: calc(var(--qc-font-size, 14px) - 1px);
      overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    }
    .qc-history-text {
      flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      font-family: monospace; color: var(--_text, #e8edf5);
    }
    /* 空状态：清空记录 / 筛选无结果时给一句明确提示（原先只有一个破折号，用户以为没渲染出来） */
    .qc-history-empty {
      padding: 18px 14px; text-align: center; color: var(--_text-muted, #5a5f6f);
      font-size: calc(var(--qc-font-size, 14px) - 1px); line-height: 1.6;
    }
    /* 弹窗右上角关闭按钮（新建/编辑命令、分组） */
    .qc-modal-close {
      position: absolute; top: 10px; right: 10px;
      background: none; border: 0; cursor: pointer; padding: 2px 7px;
      color: var(--_text-muted, #5a5f6f); font-size: calc(var(--qc-font-size, 14px) + 1px);
      line-height: 1.2; border-radius: 4px; font-family: inherit;
    }
    .qc-modal-close:hover { background: var(--_hover, #2d3242); color: var(--_text, #e8edf5); }
    /* 执行记录图标：视觉重心偏下，整体上移 2px 与齿轮/排序/图钉齐平 */
    .qc-action-history svg { transform: translateY(-2px); }
    /* 记录筛选：连接下拉 + 起止时间 */
    .qc-history-filters {
      display: flex; align-items: center; gap: 6px; margin-bottom: 8px; flex-wrap: wrap;
    }
    /* 弹窗内的通用自绘下拉
       ⚠️ 原生 <select> 在 Electron 无边框窗口的 body 级面板浮层里点击不会弹出选项（平台级问题），
       分组筛选早已换成 .qc-filter-menu；弹窗里的「连接/时间筛选」和「命令分组」曾是漏网的旧写法。
       外观对齐面板已有的下拉，避免同一个面板里出现两套控件风格。 */
    .qc-dd { position:relative; flex-shrink:0; }
    .qc-dd-btn {
      display:flex; align-items:center; gap:6px; padding:3px 6px; box-sizing:border-box;
      border-radius:4px; border:1px solid var(--_border, #2d3242);
      background:var(--_surface); color:var(--_text);
      font-size:12px; font-family:inherit; cursor:pointer; user-select:none;
      max-width:220px;
    }
    .qc-dd-btn:hover { background:var(--_hover, #2d3242); }
    .qc-dd-text { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .qc-dd-caret { flex-shrink:0; font-size:9px; line-height:1; color:var(--_text-muted, #5a5f6f); }
    .qc-dd-menu {
      position:absolute; top:calc(100% + 4px); left:0; min-width:120px; max-width:340px; max-height:200px;
      overflow-y:auto; padding:4px; z-index:60;
      background:var(--_surface, #252830); border:0.5px solid var(--_border, #2d3242); border-radius:8px;
      box-shadow:0 10px 28px rgba(0,0,0,.5), 0 0 0 .5px rgba(255,255,255,.04);
      animation: qc-menu-in .08s ease-out;
    }
    .qc-dd-menu::-webkit-scrollbar { width:8px; }
    .qc-dd-menu::-webkit-scrollbar-track { background:transparent; }
    .qc-dd-menu::-webkit-scrollbar-thumb {
      background:rgba(255,255,255,.14); border-radius:4px; border:2px solid transparent; background-clip:padding-box;
    }
    .qc-dd-menu::-webkit-scrollbar-thumb:hover { background:rgba(255,255,255,.26); background-clip:padding-box; }
    .qc-dd-item {
      padding:6px 10px; border-radius:6px; font-size:12px; color:var(--_text, #e8edf5);
      cursor:pointer; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
    }
    .qc-dd-item:hover { background:var(--_hover, #2d3242); }
    .qc-dd-item.active { color:var(--_accent, #b6b6c3); background:rgba(127,127,127,.14); }
    /* 满宽变体：弹窗表单项里当输入框用（分组下拉） */
    .qc-dd-block { width:100%; }
    .qc-dd-block .qc-dd-btn {
      width:100%; max-width:none; padding:7px 8px; border-radius:6px; font-size:var(--qc-font-size, 14px);
    }
    .qc-dd-block .qc-dd-menu { max-height:220px; }
    .qc-dd-block .qc-dd-item { font-size:var(--qc-font-size, 14px); }
    /* 下拉框 / 日期框：对齐 SFTP+ 传输记录（.log-date-field input） */
    .qc-history-date {
      padding: 3px 6px; border-radius: 4px;
      border: 1px solid var(--_border);
      background: var(--_content); color: var(--_text);
      font-size: 12px; outline: none; font-family: inherit;
    }
    .qc-history-date:focus {
      border-color: var(--_primary);
      box-shadow: 0 0 0 1px var(--_primary);
    }
    .qc-history-sep { color: var(--_text-muted, #5a5f6f); font-size: 12px; }
    /* 连接列字号与执行时间一致（-1px）：原先 -4px 显得比时间小一大截，两列不成一组 */
    .qc-history-target {
      flex: 0 0 150px; width: 150px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: var(--_text-muted, #5a5f6f); font-size: calc(var(--qc-font-size, 14px) - 1px);
    }
    /* 命令名称列（执行时快照）：比正文略淡、比连接列更显眼，长名称省略号 + title 看全 */
    .qc-history-name {
      flex: 0 0 170px; width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
      color: var(--_text); font-size: calc(var(--qc-font-size, 14px) - 1px);
    }
    /* 导出 / 清空：与底部按钮同款（SFTP+ .dialog-buttons button） */
    .qc-history-act {
      padding: 4px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content); color: var(--_text);
      font-size: var(--qc-font-size, 14px); font-family: inherit;
      cursor: pointer; white-space: nowrap;
    }
    .qc-history-act:hover { background: var(--_hover, rgba(128,128,128,0.1)); }
    .qc-history-act-danger:hover { color: #d9534f; }
    /* 底部：条数 + 关闭 */
    .qc-history-footer {
      display: flex; align-items: center; justify-content: space-between; gap: 10px;
      margin-top: 10px; padding-top: 8px; border-top: 0.5px solid var(--_border, #2d3242);
    }
    .qc-history-count { font-size: calc(var(--qc-font-size, 14px) - 3px); color: var(--_text-muted, #5a5f6f); }
    /* 底部按钮对齐 SFTP+ 传输记录（.dialog-buttons button）：
       细边框 + --_content 底色 + 主题文字色，hover 用 --_hover；不走主色，避免与主题冲突 */
    .qc-history-footer button {
      padding: 4px 12px; border-radius: 6px;
      border: 1px solid var(--_border);
      background: var(--_content);
      color: var(--_text); cursor: pointer;
      font-size: var(--qc-font-size, 14px); font-family: inherit;
    }
    .qc-history-footer button:hover { background: var(--_hover, rgba(128,128,128,0.1)); }
    /* Tab 焦点：浏览器默认橙色描边太扎眼，换成主题色的柔和描边（仍保留键盘可见性） */
    .qc-panel *:focus { outline: none; }
    .qc-panel *:focus-visible { outline: 1px solid var(--_accent, #6b7ee9); outline-offset: 1px; border-radius: 4px; }

    /* ====== 分组编辑弹窗 ====== */
    .qc-group-modal { max-width: 480px; min-width: 380px; }
    .qc-group-modal-title {
      display: flex; align-items: center; gap: 10px;
      font-weight: 500; font-size: calc(var(--qc-font-size, 14px) + 2px);
      color: var(--_text); margin-bottom: 18px; padding-bottom: 12px;
      border-bottom: 1px solid var(--_border, #2d3242);
    }
    .qc-group-modal-icon { font-size: 18px; opacity: .7; }
    .qc-group-form-row {
      display: flex; gap: 12px; margin-bottom: 6px;
    }
    .qc-group-form-col { display: flex; flex-direction: column; gap: 4px; }
    .qc-group-form-name { flex: 1; }
    .qc-group-form-order { width: 80px; flex-shrink: 0; }
    .qc-group-form-label {
      font-size: calc(var(--qc-font-size, 14px) - 2px);
      color: var(--_text-muted, #5a5f6f); font-weight: 500;
    }
    .qc-group-form-section {
      margin-top: 12px; padding-top: 10px;
      border-top: 1px solid var(--_border, #2d3242);
    }
    .qc-group-form-empty { border-top: none; margin-top: 8px; padding-top: 0; }
    .qc-empty-hint { font-size: calc(var(--qc-font-size, 14px) - 2px); color: var(--_text-muted); }

    /* 配置连接列表 */
    .qc-group-profiles-header {
      display: flex; align-items: center; justify-content: space-between;
      margin-bottom: 8px;
    }
    .qc-group-profiles-toggle {
      font-size: calc(var(--qc-font-size, 14px) - 2px);
      color: var(--_accent, #b6b6c3); cursor: pointer;
      padding: 2px 6px; border-radius: 4px; white-space: nowrap;
      user-select: none;
    }
    .qc-group-profiles-toggle:hover { background: rgba(180,190,254,0.1); }
    .qc-group-profiles-list {
      max-height: 240px; overflow-y: auto;
      border: 1px solid var(--_border, #2d3242); border-radius: 6px;
      background: var(--_input-bg, #1a1d23);
    }
    .qc-group-profile-row {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px; cursor: pointer; user-select: none;
      border-bottom: 0.5px solid var(--_border, #2d3242);
      transition: background .1s;
    }
    .qc-group-profile-row.last { border-bottom: none; }
    .qc-group-profile-row:hover { background: var(--_hover, #2d3242); }
    .qc-group-profile-row.selected { background: rgba(180,190,254,0.06); }
    .qc-group-profile-row input[type="checkbox"] {
      margin: 0; flex-shrink: 0; accent-color: var(--_accent, #b6b6c3);
    }
    .qc-group-profile-body {
      flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px;
    }
    .qc-group-profile-name {
      font-size: calc(var(--qc-font-size, 14px) - 1px);
      color: var(--_text, #e8edf5); font-weight: 500;
    }
    .qc-group-profile-conn {
      font-size: calc(var(--qc-font-size, 14px) - 3px);
      color: var(--_text-muted, #5a5f6f); font-family: monospace;
    }
    .qc-group-profiles-count {
      font-size: calc(var(--qc-font-size, 14px) - 2px);
      color: var(--_accent, #b6b6c3);
    }
    .qc-group-profiles-list::-webkit-scrollbar { width: 5px; }
    .qc-group-profiles-list::-webkit-scrollbar-track { background: transparent; }
    .qc-group-profiles-list::-webkit-scrollbar-thumb { background: var(--_border); border-radius: 3px; }

    .qc-group-profiles-footer { margin-top: 6px; }
    .qc-group-profiles-hint {
      font-size: calc(var(--qc-font-size, 14px) - 2px);
      color: var(--_text-muted, #5a5f6f);
    }
    .qc-group-footer { margin-top: 16px; padding-top: 10px; border-top: 1px solid var(--_border, #2d3242); }
    .qc-edit-check { display:flex; gap:12px; margin-top:8px; }
    .qc-edit-check label { display:flex; align-items:center; gap:4px; font-size:var(--qc-font-size, 14px); color:var(--_text); cursor:pointer; }
    .qc-edit-check input { margin:0; }
    /* 单条命令的「通知刷新」三态：独立一行，避免与上方勾选项混读 */
    .qc-edit-notify { display:flex; align-items:center; gap:6px; margin-top:8px; flex-wrap:wrap; }
    .qc-edit-notify-label { font-size:var(--qc-font-size, 14px); color:var(--_text); margin-right:2px; }
    .qc-edit-notify-pill {
      padding:2px 8px; border-radius:5px; cursor:pointer; user-select:none;
      font-size:calc(var(--qc-font-size, 14px) - 2px);
      color:var(--_text-muted, #5a5f6f); border:1px solid var(--_border);
      background:transparent;
    }
    .qc-edit-notify-pill:hover { color:var(--_text); }
    .qc-edit-notify-pill.active {
      color:var(--_bg, #1b1e28); font-weight:600;
      background:var(--_accent, #7aa2f7); border-color:var(--_accent, #7aa2f7);
    }

    /* 命令步骤列表 */
    .qc-steps-label { font-size:calc(var(--qc-font-size, 14px) - 1px); font-weight:500; color:var(--_text-muted); margin-bottom:4px; margin-top:8px; }
    .qc-step-row { display:flex; gap:4px; align-items:center; margin-bottom:3px; }
    .qc-step-row.dragging { opacity: 0.4; }
    .qc-step-row.drag-over { border-top: 2px solid var(--_primary, #b6b6c3); }
    .qc-step-row.drag-over-bottom { border-bottom: 2px solid var(--_primary, #b6b6c3); }
    .qc-step-row.qc-step-disabled { opacity:0.45; }
    .qc-step-row.qc-step-disabled .qc-step-input,
    .qc-step-row.qc-step-disabled .qc-step-delay { color:var(--_text-muted); }
    .qc-step-enabled { margin:0; cursor:pointer; flex-shrink:0; }
    .qc-step-drag { font-size:var(--qc-font-size, 14px); color:var(--_text-muted); cursor:grab; flex-shrink:0; width:16px; text-align:center; user-select:none; }
    .qc-step-drag:active { cursor:grabbing; }
    .qc-step-type { font-size:var(--qc-font-size, 14px); cursor:pointer; flex-shrink:0; padding:1px 4px; border-radius:3px; color:var(--_accent); }
    .qc-step-type.is-break { color:#fab387; background:rgba(250,179,135,0.12); }
    .qc-step-type:hover { background:rgba(255,255,255,0.08); }
    .qc-step-input {
      flex:1; padding:7px 8px; border-radius:6px; box-sizing:border-box;
      background:var(--_input-bg); border:0.5px solid var(--_border);
      color:var(--_text); font-size:var(--qc-font-size, 14px); outline:none; resize:none;
      overflow:hidden; min-height:28px; field-sizing:content; caret-color:var(--_text);
    }
    .qc-step-input:focus { border-color:var(--_accent); }
    .qc-step-delay {
      width:64px; padding:7px 4px; border-radius:6px; box-sizing:border-box; flex-shrink:0;
      background:var(--_input-bg); border:0.5px solid var(--_border);
      color:var(--_text-muted); font-size:calc(var(--qc-font-size, 14px) - 2px); outline:none; text-align:center;
    }
    .qc-step-delay:focus { border-color:var(--_accent); color:var(--_text); }
    .qc-step-del {
      flex-shrink:0; cursor:pointer; color:var(--_text-muted); font-size:calc(var(--qc-font-size, 14px) - 1px); padding:2px 6px; border-radius:4px;
    }
    .qc-step-del:hover { color:#e24b4a; background:rgba(226,75,74,0.12); }
    .qc-step-break-label { font-size:var(--qc-font-size, 14px); color:#fab387; font-weight:500; padding:0 4px; flex:1; }
    .qc-step-actions { display:flex; gap:12px; margin-top:2px; }
    .qc-step-add { font-size:var(--qc-font-size, 14px); color:var(--_accent); cursor:pointer; padding:2px 0; }
    .qc-step-add:hover { text-decoration:underline; }
    .qc-step-add-break { color:#fab387; }
    .qc-edit-btn {
      padding:5px 14px; border-radius:6px; border:0.5px solid var(--_border);
      background:var(--_surface); color:var(--_text);
      font-size:var(--qc-font-size, 14px); cursor:pointer;
    }
    .qc-edit-btn:hover { background:var(--_hover); }
    /* 确定按钮不再特殊化（曾用过无 fallback 的主色与固定蓝，都与主题冲突）；
       与普通按钮同款，观感对齐执行记录面板的底部按钮 */

    /* 自定义滚动条 */
    .qc-list::-webkit-scrollbar,
    .qc-quick-bar::-webkit-scrollbar {
      width: 6px;
      height: 6px;
    }
    .qc-list::-webkit-scrollbar-track,
    .qc-quick-bar::-webkit-scrollbar-track {
      background: transparent;
    }
    .qc-list::-webkit-scrollbar-thumb,
    .qc-quick-bar::-webkit-scrollbar-thumb {
      background: var(--_border, #2d3242);
      border-radius: 3px;
    }
    .qc-list::-webkit-scrollbar-thumb:hover,
    .qc-quick-bar::-webkit-scrollbar-thumb:hover {
      background: var(--_text-muted, #5a5f6f);
    }
  `],
})
export class QuickCommandFloatingPanel implements OnInit, OnDestroy {
  @ViewChild('listRef') listRef!: ElementRef

  svc: QuickCommandService
  i18n = new QuickCommandI18nService()

  constructor(
    @Optional() configService?: ConfigService,
    @Inject(ElementRef) public elRef: ElementRef = null as any,
    @Optional() logService?: LogService,
    @Optional() private app?: AppService,
    @Optional() private cdr?: ChangeDetectorRef,
  ) {
    this.svc = new QuickCommandService(configService)
    // 诊断通道：键盘跳转失效时可在 Tabby 的 log.txt 里 grep `[qc-kb]`
    try { this._dbg = logService?.create?.('qc-kb') ?? null } catch { /* ignore */ }
  }

  private _dbg: any = null
  /** 数字缓冲停顿后自动提交的计时器 */
  private _applyTimer: any = null

  private destroyed = false
  minimized = false
  /** 触发本次打开的终端 hostEl（split 场景下用于判断面板是否落在当前 pane 视野内） */
  terminalHostEl: HTMLElement | null = null
  panelX = 20
  panelY = 60
  /** 面板常驻（开启后执行命令不自动关闭面板） */
  pinPanel = true
  /** 面板整体透明度（0.5–1），默认 1 */
  panelOpacity = 1
  /** 面板宽度，从 localStorage 恢复，默认 320 */
  panelWidth: number = +(localStorage.getItem('qc-plus-panel-width') || '320')
  /** 用户意图宽度（未被 pane 裁剪的原始值）：切换 pane / 拆分比例变化时据此重新裁剪，
   *  避免把「窄 pane 下被压缩的尺寸」当成新基准而越开越小（对齐 SFTP+ 的几何串味修复） */
  private _storedWidth: number = +(localStorage.getItem('qc-plus-panel-width') || '320')
  /** 用户意图高度（0 = 未手动设定，按内容自适应） */
  private _storedHeight: number = +(localStorage.getItem('qc-plus-panel-height') || '0')
  /** 未手动设定高度时的自适应上限：跟随 pane 高度，拆分窄窗下不再固定 420 而溢出 */
  autoMaxHeight = 420
  /** 面板高度，0 表示自动（不固定），拖拽后持久化 */
  panelHeight: number = +(localStorage.getItem('qc-plus-panel-height') || '0')
  private resizing: { dir: string; startW: number; startH: number; lastX: number; lastY: number } | null = null
  private resizeMoveHandler: ((ev: MouseEvent) => void) | null = null
  private resizeUpHandler: (() => void) | null = null
  searchText = ''
  filterGroup = ''
  highlightedId = ''

  commands: QuickCommand[] = []
  groups: QuickCommandGroup[] = []
  filteredCommands: QuickCommand[] = []
  pinnedCommands: QuickCommand[] = []

  sshHost = ''
  terminalRef: any = null
  profileId = ''

  onClose: (() => void) | null = null
  onMinimize: (() => void) | null = null
  /** 面板标题栏齿轮 → 打开 Tabby 设置页（由 decorator 注入回调） */
  onOpenSettings: (() => void) | null = null
  /** 隐藏面板标题栏的设置入口（设置页「功能」开关控制） */
  hideSettingsEntry = false
  /** 排序模式：manual = 拖拽顺序（默认）；name = 按名称；usage = 按执行次数（仅影响显示，不改存储顺序） */
  sortMode: 'manual' | 'name' | 'usage' = 'manual'
  /** 滚动停止后是否把列表吸附到整行（设置页开关，默认关闭） */
  scrollSnapEnabled = false
  /**
   * 命令执行完毕后的焦点策略（设置页「焦点策略」，默认 terminal 维持原行为）：
   * terminal = 聚焦终端；panel = 焦点回到面板并保留原选中行（仅面板常驻时有效，
   * 未常驻时面板会自动收起，一律回退终端，避免焦点落在被移除的面板上）。
   */
  focusAfterExec: 'panel' | 'terminal' = 'terminal'
  /**
   * 命令行的操作入口（设置页「操作方式」）：hover = 只在悬停时显示按钮、右键直接进编辑；
   * menu = 只走右键菜单（悬停不显示按钮）；both = 两者都支持（默认）。
   */
  actionMode: 'hover' | 'menu' | 'both' = 'both'
  /**
   * 命令执行后是否向其它插件广播「刷新请求」（设置页开关，默认关）。
   * 接收方示例：SFTP+ 的「执行 QuickCmd+ 命令后刷新列表」。
   * ⛔ 只在「命令真的发出去了」时广播：仅发送（appendCR=false）不算，命令还停在输入行没跑。
   */
  broadcastExecEvents = false

  private dragging = false
  private dragOffsetX = 0
  private dragOffsetY = 0
  private dragMoveHandler: any = null
  private dragUpHandler: any = null

  get allGroups(): QuickCommandGroup[] {
    return this.groups
  }

  get displayGroups(): QuickCommandGroup[] {
    return this.sortGroups(this.groups.filter(g => {
      // 分组筛选
      if (this.filterGroup === '__ungrouped__') {
        if (g.name !== '') return false
      } else if (this.filterGroup === '__auto__') {
        // 自动模式：仅显示明确分配给当前连接的分组（全局布局下「当前连接」= 当前激活标签）
        const pid = this._activeProfileId()
        if (!pid) return true
        if (!g.profileIds || g.profileIds.length === 0) return false
        return g.profileIds.includes(pid)
      } else if (this.filterGroup) {
        if (g.name !== this.filterGroup) return false
      }
      if (this.searchText) {
        const cmds = this.getGroupCommands(g.name)
        return cmds.length > 0
      }
      return true
    }))
  }

  trackGroup(_i: number, g: QuickCommandGroup): string { return g.name || '_ungrouped_' }

  get selectedCount(): number {
    if (this.filterGroup === '__auto__' && this._activeProfileId()) {
      return this.filteredCommands.filter(c => {
        const g = this.groups.find(gr => (gr.name || '') === (c.group || ''))
        return !!(g?.profileIds?.length && g.profileIds.includes(this.profileId))
      }).length
    }
    return this.filteredCommands.length
  }

  ngOnInit(): void {
    // 默认位置算法版本：算法一改，旧坐标记忆就是错的（表现为"启动位置不对，还原默认位置后才正常"）。
    // 版本不符 ⇒ 丢弃旧记忆并回到「默认位置」状态，用户无需再手动还原。
    try {
      const VER_KEY = 'qc-plus-panel-pos-ver'
      const CUR_VER = '3'   // ⚠️ 每次修改 computeDefaultPos 都要 +1
      if (localStorage.getItem(VER_KEY) !== CUR_VER) {
        this.svc.clearPanelPosition()
        localStorage.setItem('qc-plus-panel-at-default', '1')
        localStorage.setItem(VER_KEY, CUR_VER)
      }
    } catch { /* ignore */ }
    // 「是否默认位置」：从未存过标志时，按有没有位置记忆推断（无记忆 = 首次打开 = 默认位置）
    const atDefaultFlag = (() => { try { return localStorage.getItem('qc-plus-panel-at-default') } catch { return null } })()
    this.atDefaultPos = atDefaultFlag === null ? !this.svc.hasPanelPosition() : atDefaultFlag === '1'
    window.addEventListener('resize', this._scheduleRelayout)
    // 全局布局：切标签后刷新连接标识与发送目标（否则「自动」筛选还停在打开面板时的连接）
    try {
      const appAny: any = this.app
      this._tabChangeSub = appAny?.tabChange$?.subscribe?.(() => this._refreshForActiveTab()) ?? null
    } catch { /* ignore */ }
    this._refreshForActiveTab()
    this._startTabPolling()
    // 先确定当前连接，再恢复该连接的筛选/搜索（避免 loadData → onSearch 用空值覆盖）
    this.initTerminalInfo()
    // ResizeObserver 观察终端区域：覆盖「拖拆分栏 / pane 尺寸变化」—— 这些不会触发 window.resize
    try {
      if (typeof ResizeObserver !== 'undefined') {
        const hostEl = this.terminalHostEl || (this.terminalRef?.element?.nativeElement as HTMLElement | null)
        if (hostEl) {
          this._ro = new ResizeObserver(() => this._scheduleRelayout())
          this._ro.observe(hostEl)
        }
      }
    } catch { /* ignore */ }
    this.restoreConnectionFilter()
    this.loadPinPanel()
    this.loadHideSettingsEntry()
    this.loadPanelOpacity()
    this.loadBroadcastExecEvents()
    this.loadSortMode()
    this.loadScrollSnap()
    this.loadFocusAfterExec()
    this.loadActionMode()
    this.loadData()
    // Auto 主题按「当前」宿主主题重判一次：插件加载时主题变量可能未注入，判错会让面板颜色与界面不匹配
    try { window.dispatchEvent(new CustomEvent('qc-plus-sync-theme')) } catch { /* ignore */ }
    window.addEventListener('qc-plus-locale-changed', this.onLocaleChanged)
    window.addEventListener('qc-plus-data-changed', this.onDataChanged)
    window.addEventListener('qc-plus-config-changed', this._onConfigChanged)
    // 右键菜单捕获兜底（修饰键组合下元素级绑定会收不到事件，见 _cmdContextCapture）
    window.addEventListener('contextmenu', this._cmdContextCapture, true)
    // 弹窗键盘兜底（捕获级）：焦点不在弹窗内时也能把 Enter/Esc 送进弹窗
    document.addEventListener('keydown', this._docKeydownCapture, true)
  }

  /** 面板复用（切换终端）时刷新：重新识别连接并恢复该连接的位置/筛选 */
  applyPositionMemory(): void {
    this.initTerminalInfo()
    this.restoreConnectionFilter()
    this.restorePosition()
    this.loadData()
    // 首帧位置是初始值（20,60），紧随 restorePosition / clampToHostPane 才修正到真实位置 ⇒
    // 不加门控会看到"错位闪一下"。这里等定位稳定后再显示，并顺带把焦点交给面板。
    this.panelReady = false
    setTimeout(() => {
      this.panelReady = true
      this.focusPanel()
    }, 32)
    // 防御：万一首帧定时器因异常没跑到，600ms 后强制显示，避免面板"看起来在却完全点不到"
    setTimeout(() => { if (!this.panelReady) { this.panelReady = true } }, 600)
  }

  /** 定位/数据就绪后才显示面板（避免首次打开时错位帧闪现） */
  panelReady = false

  /** 恢复当前连接记住的分组筛选 + 搜索词 */
  private restoreConnectionFilter(): void {
    const f = this.svc.getConnectionFilter(this.profileId)
    this.filterGroup = f.filterGroup
    this.searchText = f.searchText
  }

  private initTerminalInfo(): void {
    if (this.terminalRef) {
      try {
        const ssh = this.terminalRef?.sshSession ?? this.terminalRef?._session ?? null
        if (ssh) {
          this.sshHost = ssh.host || ssh.options?.host || ''
          if (this.sshHost) this.sshHost = '@' + this.sshHost
        }
      } catch { /* ignore */ }
    }
    if (!this.profileId && this.terminalRef?.profile?.id) {
      this.profileId = this.terminalRef.profile.id
    }
    if (!this.profileId && this.terminalRef) {
      try {
        const ssh = this.terminalRef?.sshSession ?? this.terminalRef?._session ?? null
        if (ssh?.host) this.profileId = 'ssh:' + ssh.host
      } catch { /* ignore */ }
    }
  }

  ngOnDestroy(): void {
    this.destroyed = true
    this._disarmMenuOutsideClose()
    this.savePosMemory()
    window.removeEventListener('resize', this._scheduleRelayout)
    try { this._tabChangeSub?.unsubscribe?.() } catch { /* ignore */ }
    this._tabChangeSub = null
    if (this._tabPollTimer) { clearInterval(this._tabPollTimer); this._tabPollTimer = null }
    if (this._ro) { try { this._ro.disconnect() } catch { /* ignore */ } this._ro = null }
    if (this._resizeRaf !== null) { cancelAnimationFrame(this._resizeRaf); this._resizeRaf = null }
    if (this._applyTimer) { clearTimeout(this._applyTimer); this._applyTimer = null }
    if (this._numTimer) { clearTimeout(this._numTimer); this._numTimer = null }
    if (this._tickTimer) { clearTimeout(this._tickTimer); this._tickTimer = null }
    if (this._zeroTimer) { clearTimeout(this._zeroTimer); this._zeroTimer = null }
    window.removeEventListener('qc-plus-locale-changed', this.onLocaleChanged)
    window.removeEventListener('qc-plus-data-changed', this.onDataChanged)
    window.removeEventListener('qc-plus-config-changed', this._onConfigChanged)
    window.removeEventListener('contextmenu', this._cmdContextCapture, true)
    document.removeEventListener('keydown', this._docKeydownCapture, true)
    this.cleanDrag()
    this.cleanResize()
    if (this._snapTimer) { clearTimeout(this._snapTimer); this._snapTimer = null }
  }

  private onLocaleChanged = (): void => {
    this.i18n = new QuickCommandI18nService()
    this.loadData()
  }

  private _onConfigChanged = (ev: Event): void => {
    const detail = (ev as CustomEvent).detail
    if (detail && typeof detail.pinPanel === 'boolean') {
      this.pinPanel = detail.pinPanel
    }
    if (detail && typeof detail.panelOpacity === 'number') {
      this.panelOpacity = Math.min(1, Math.max(0.5, detail.panelOpacity))
      this._applyPanelOpacity()
    }
    if (detail && typeof detail.hidePanelSettingsEntry === 'boolean') {
      this.hideSettingsEntry = detail.hidePanelSettingsEntry
    }
    if (detail && (detail.sortMode === 'manual' || detail.sortMode === 'name' || detail.sortMode === 'usage')) {
      this.sortMode = detail.sortMode
    }
    if (detail && typeof detail.scrollSnapEnabled === 'boolean') {
      this.scrollSnapEnabled = detail.scrollSnapEnabled
      // 关闭时丢弃可能已排队的吸附，避免开关关掉后仍跳一次
      if (!this.scrollSnapEnabled && this._snapTimer) { clearTimeout(this._snapTimer); this._snapTimer = null }
    }
    if (detail && (detail.focusAfterExec === 'panel' || detail.focusAfterExec === 'terminal')) {
      this.focusAfterExec = detail.focusAfterExec
    }
    if (detail && (detail.actionMode === 'hover' || detail.actionMode === 'menu' || detail.actionMode === 'both')) {
      this.actionMode = detail.actionMode
    }
    if (detail && typeof detail.broadcastExecEvents === 'boolean') {
      this.broadcastExecEvents = detail.broadcastExecEvents
    }
  }

  /** 从 Tabby 配置加载「面板常驻」设置 */
  loadPinPanel(): void {
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      if (cfg?.pinPanel !== undefined) {
        this.pinPanel = !!cfg.pinPanel
        return
      }
    } catch { /* ignore */ }
    // 回退到 localStorage
    try {
      const raw = localStorage.getItem('qc-plus-pin-panel')
      if (raw !== null) this.pinPanel = raw === 'true'
    } catch { /* ignore */ }
  }

  /** 加载面板整体透明度（config 优先，回退默认值 1） */
  loadPanelOpacity(): void {
    let v = 1
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      if (cfg?.panelOpacity !== undefined) {
        v = Math.min(1, Math.max(0.5, Number(cfg.panelOpacity)))
      }
    } catch { /* ignore */ }
    this.panelOpacity = v
    this._applyPanelOpacity()
  }

  /**
   * 加载「命令执行后向其它插件广播刷新请求」开关（config 优先，默认关）。
   * 不提供 localStorage 回退：这是跨插件可见性设置，跟着 config 备份/导出走更合理。
   * @创建人：DD1024z + Deepseek-V4.1-Flash
   * @创建时间：2026-10-27
   */
  loadBroadcastExecEvents(): void {
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      if (cfg?.broadcastExecEvents !== undefined) this.broadcastExecEvents = !!cfg.broadcastExecEvents
    } catch { /* ignore */ }
  }

  /** 将面板透明度写入 CSS 变量 --_panel-opacity */
  private _applyPanelOpacity(): void {
    const el = this.elRef?.nativeElement as HTMLElement | undefined
    if (!el) return
    el.style.setProperty('--_panel-opacity', String(this.panelOpacity))
  }

  /** 从 Tabby 配置加载「隐藏面板设置入口」设置（回退 localStorage） */
  loadHideSettingsEntry(): void {
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      if (cfg?.hidePanelSettingsEntry !== undefined) {
        this.hideSettingsEntry = !!cfg.hidePanelSettingsEntry
        return
      }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem('qc-plus-hide-entry-settings')
      if (raw !== null) this.hideSettingsEntry = raw === 'true'
    } catch { /* ignore */ }
  }

  /** 当前排序模式的可读名称（按钮 tooltip 用） */
  get sortModeLabel(): string {
    if (this.sortMode === 'name') return this.i18n.t('panel.sort_name')
    if (this.sortMode === 'usage') return this.i18n.t('panel.sort_usage')
    return this.i18n.t('panel.sort_manual')
  }

  /** 循环切换排序模式：拖拽顺序 → 名称 → 执行次数 → 拖拽顺序 */
  cycleSortMode(): void {
    this.sortMode = this.sortMode === 'manual' ? 'name' : (this.sortMode === 'name' ? 'usage' : 'manual')
    try { localStorage.setItem('qc-plus-sort-mode', this.sortMode) } catch { /* ignore */ }
    // 同步到 Tabby 配置（与其它面板偏好一起被备份/导出）
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      if (cfg) { cfg.sortMode = this.sortMode; (this.svc as any)._configService.save() }
    } catch { /* ignore */ }
  }

  /** 加载排序模式（config 优先，回退 localStorage） */
  loadSortMode(): void {
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      const v = cfg?.sortMode
      if (v === 'manual' || v === 'name' || v === 'usage') { this.sortMode = v; return }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem('qc-plus-sort-mode')
      if (raw === 'manual' || raw === 'name' || raw === 'usage') this.sortMode = raw
    } catch { /* ignore */ }
  }

  /** 加载「滚动吸附到整行」开关（config 优先，回退 localStorage；默认关闭） */
  loadScrollSnap(): void {
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      if (typeof cfg?.scrollSnapEnabled === 'boolean') { this.scrollSnapEnabled = cfg.scrollSnapEnabled; return }
    } catch { /* ignore */ }
    try {
      const raw = localStorage.getItem('qc-plus-scroll-snap')
      if (raw !== null) this.scrollSnapEnabled = raw === 'true'
    } catch { /* ignore */ }
  }

  /** 加载「命令执行后焦点策略」（仅 config，无 localStorage 回退；默认 terminal） */
  loadFocusAfterExec(): void {
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      if (cfg?.focusAfterExec === 'panel' || cfg?.focusAfterExec === 'terminal') {
        this.focusAfterExec = cfg.focusAfterExec
      }
    } catch { /* ignore */ }
  }

  /** 加载「操作方式」（仅 config，无 localStorage 回退；默认 both） */
  loadActionMode(): void {
    try {
      const cfg = (this.svc as any)._configService?.store?.['tabby-quick-command-plus']
      const m = cfg?.actionMode
      if (m === 'hover' || m === 'menu' || m === 'both') this.actionMode = m
    } catch { /* ignore */ }
  }

  /** 按当前模式重排分组（只影响显示，不改存储顺序） */
  private sortGroups(list: QuickCommandGroup[]): QuickCommandGroup[] {
    if (this.sortMode === 'manual') return list
    const arr = list.slice()
    if (this.sortMode === 'name') {
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
    } else {
      // 执行次数：组内命令次数之和，降序
      arr.sort((a, b) => this._groupUsage(b.name) - this._groupUsage(a.name))
    }
    return arr
  }

  private _groupUsage(groupName: string): number {
    return this.getGroupCommands(groupName).reduce((s, c) => s + (c.usageCount || 0), 0)
  }

  /** 切换「面板常驻」设置 */
  togglePinPanel(): void {
    this.pinPanel = !this.pinPanel
    try { localStorage.setItem('qc-plus-pin-panel', String(this.pinPanel)) } catch { /* ignore */ }
    // 必须写回 Tabby 配置：设置页的「面板常驻」是从 config 读的，
    // 只写 localStorage 会导致「在面板上取消常驻后，设置页仍显示开启」两边不同步。
    try {
      const cs = (this.svc as any)._configService
      const cfg = cs?.store?.['tabby-quick-command-plus']
      if (cfg) { cfg.pinPanel = this.pinPanel; cs.save() }
    } catch { /* ignore */ }
    window.dispatchEvent(new CustomEvent('qc-plus-config-changed', { detail: { pinPanel: this.pinPanel } }))
  }

  /** 如果未开启「面板常驻」，则延迟关闭（避免焦点切换导致的卡顿） */
  private maybeClosePanel(): void {
    if (!this.pinPanel && this.onClose) {
      // 使用 requestAnimationFrame 确保终端焦点操作先完成，再关闭面板
      requestAnimationFrame(() => {
        // 额外加一层 setTimeout(0) 确保事件循环中焦点已经稳定
        setTimeout(() => this.doClose(), 0)
      })
    }
  }

  private onDataChanged = (): void => {
    // 应用锁定状态期间忽略数据事件，否则 toggle → data-changed → loadData → 再 toggle 会打起来
    if (this._applyingLock) return
    this.loadData()
  }

  loadData(): void {
    this.svc.reload()
    this.commands = this.svc.getAll()
    this.groups = this.svc.getGroups()
    this.pinnedCommands = this.svc.getPinned()
    if (this.filterGroup && this.filterGroup !== '__auto__') {
      const valid = this.groups.some(g =>
        this.filterGroup === '__ungrouped__' ? !g.name : g.name === this.filterGroup
      )
      if (!valid) this.filterGroup = ''
    }
    // reload 会把「锁定分组」的筛选/展开按配置重读覆盖（saveGroups 是异步落盘），这里按锁定组名重新落地
    this._reapplyGroupLock()
    this.onSearch()
  }

  /**
   * 锁定分组后重新应用筛选与展开（幂等）。
   * 背景：`toggleGroupExpanded()` 的写盘是异步的，紧接着的 reload 会读到旧配置，
   * 把刚设置的 expanded / filterGroup 冲掉 ⇒ 表现为「按数字后下拉框不切、分组不展开」。
   * 因此以 groupLockName 为真源，在每次数据刷新后重新落地一次。
   */
  private _reapplyGroupLock(): void {
    if (this.groupLockName === null) return
    this._applyingLock = true
    try {
      const g = this.svc.getGroups().find(x => x.name === this.groupLockName)
      if (!g) {
        // 分组被删掉了：解除锁定
        this.groupLockNo = null
        this.groupLockName = null
        this.filterGroup = ''
        return
      }
      if (!g.expanded) this.svc.toggleGroupExpanded(g.name)
      this.groups = this.svc.getGroups()
      const want = g.name || '__ungrouped__'
      if (this.filterGroup !== want) this.filterGroup = want
      this._dbg?.info?.(`reapply name=${JSON.stringify(this.groupLockName)} found=true expanded=${g.expanded} filter=${JSON.stringify(this.filterGroup)} groups=${this.groups.length}`)
      this.onSearch()
    } finally {
      this._applyingLock = false
    }
  }

  /** 分组筛选下拉是否展开（自绘浮层，规避原生 <select> 在 Electron 下点不开的问题） */
  filterMenuOpen = false

  /** 当前分组筛选的显示文案 */
  get filterGroupLabel(): string {
    if (!this.filterGroup) return this.i18n.t('app.all_groups')
    if (this.filterGroup === '__auto__') return this.i18n.t('app.auto_filter')
    if (this.filterGroup === '__ungrouped__') return this.i18n.t('app.ungrouped')
    return this.filterGroup
  }

  toggleFilterMenu(event: MouseEvent): void {
    // 阻止冒泡到面板根的 noBubble（那里会顺手收起下拉，否则点了开了又立刻关）
    event.stopPropagation()
    this.filterMenuOpen = !this.filterMenuOpen
    if (this.filterMenuOpen) {
      // 面板本身 overflow:hidden ⇒ 菜单超出面板底部会被裁，按剩余空间收敛高度
      const scope = (event.currentTarget as HTMLElement | null)?.parentElement || null
      setTimeout(() => this._fitFilterMenu(scope), 0)
    }
  }

  /** 让下拉菜单高度贴合面板可用空间（面板可小到 200px 高）；scope 限定在本次点击的下拉容器内 */
  private _fitFilterMenu(scope: HTMLElement | null): void {
    try {
      const menu = scope?.querySelector('.qc-filter-menu') as HTMLElement | null
      if (!menu) return
      const panel = menu.closest('.qc-panel') as HTMLElement | null
      if (!panel) return
      const available = panel.getBoundingClientRect().bottom - menu.getBoundingClientRect().top - 8
      menu.style.maxHeight = `${Math.max(80, Math.min(180, available))}px`
    } catch { /* ignore */ }
  }

  /** 清除分组筛选（回到「全部分组」）；点 ✕ 不应触发下拉展开 */
  clearFilterGroup(event?: Event): void {
    event?.stopPropagation()
    this.chooseFilter('')
  }

  chooseFilter(value: string): void {
    this.filterGroup = value
    // 手动改分组筛选 = 退出「数字锁定」，否则按数字时锁定语义与显示的组不一致
    this.groupLockNo = null
    this.groupLockName = null
    this.filterMenuOpen = false
    this.onSearch()
  }

  onSearch(): void {
    let filtered = this.commands
    if (this.searchText) {
      const q = this.searchText.toLowerCase()
      filtered = filtered.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.shortName || '').toLowerCase().includes(q) ||
        (c.text || '').toLowerCase().includes(q)
      )
    }
    if (this.filterGroup === '__ungrouped__') {
      filtered = filtered.filter(c => !c.group)
    } else if (this.filterGroup === '__auto__') {
      // 自动模式：命令不过滤 group，由 displayGroups 根据 profileId 决定可见分组
    } else if (this.filterGroup) {
      filtered = filtered.filter(c => c.group === this.filterGroup)
    }
    this.filteredCommands = filtered
    // 行序列变了（搜索/筛选），键盘选中重置，避免索引指向别的命令
    this.keyNavIndex = -1
    // 按连接记住分组筛选 + 搜索词
    this.svc.saveConnectionFilter(this.profileId, { filterGroup: this.filterGroup, searchText: this.searchText })
  }

  getGroupCommands(groupName: string): QuickCommand[] {
    const list = this.filteredCommands.filter(c => (c.group || '') === (groupName || ''))
    if (this.sortMode === 'manual') return list
    const arr = list.slice()
    if (this.sortMode === 'name') {
      arr.sort((a, b) => (a.name || '').localeCompare(b.name || '', undefined, { numeric: true, sensitivity: 'base' }))
    } else {
      arr.sort((a, b) => (b.usageCount || 0) - (a.usageCount || 0))
    }
    return arr
  }

  getPreview(cmd: QuickCommand): string {
    const text = cmd.text.replace(/\n/g, ' \u21B5 ')
    return text.length > 35 ? text.slice(0, 35) + '...' : text
  }

  /** 右键分组头：直接打开该分组的「修改分组」面板（与点铅笔图标一致） */
  onGroupHeaderContextMenu(event: MouseEvent, name: string): void {
    event.preventDefault()
    event.stopPropagation()
    this.showGroupRenameDialog(name)
  }

  toggleGroup(name: string): void {
    this.svc.toggleGroupExpanded(name)
    this.groups = this.svc.getGroups()
  }

  /* ---- 键盘导航：↑↓ 选行、回车仅发送、Ctrl+回车发送并执行；分组行回车/空格展开收起 ---- */
  /** 当前键盘选中行索引（-1 = 未选中） */
  keyNavIndex = -1

  /** 数字定位输入缓冲（"1" → 分组 1；"12" 或 "1.2" → 第 1 组第 2 个命令） */
  numBuffer = ''
  private _numTimer: any = null

  private _clearNumTimer(): void {
    if (this._numTimer) { clearTimeout(this._numTimer); this._numTimer = null }
  }

  /** 800ms 无输入自动清空缓冲，避免残留数字干扰后续按键 */
  private _resetNumTimer(): void {
    this._clearNumTimer()
    this._numTimer = setTimeout(() => { this.numBuffer = ''; this._numTimer = null }, 800)
  }

  /** 已锁定的分组序号（1 起，仅用于显示 #n）；null = 未锁定 */
  groupLockNo: number | null = null
  /** 锁定分组的**真源**（组名，'' = 未分组）—— 用名字而非序号，reload 后分组顺序变化也不会锁错 */
  private groupLockName: string | null = null
  /** 正在应用锁定状态：抑制 toggle → data-changed → loadData → 再 toggle 的递归 */
  private _applyingLock = false
  /** 反引号连按判定计时器 */
  private _tickTimer: any = null
  /** 数字 0 连按判定计时器（连按两次 = 同反引号双击） */
  private _zeroTimer: any = null

  /**
   * 数字键确认后的动作（两段式）：
   *   - 未锁定 → 锁定第 n 个分组，并把「分组筛选」切到该组（等价于在下拉框选中它）
   *   - 已锁定 → 选中该组第 n 个命令（组内编号，与列表里 `.1 / .2` 一致）
   */
  /** 提交数字缓冲（回车立即提交 / 停顿 320ms 后自动提交） */
  private _commitNumBuffer(): void {
    const buf = this.numBuffer
    this.numBuffer = ''
    this._clearNumTimer()
    if (this._applyTimer) { clearTimeout(this._applyTimer); this._applyTimer = null }
    const n = parseInt(buf, 10)
    if (Number.isFinite(n) && n >= 1) this._applyNumber(n)
  }

  /**
   * ← → 切换分组：在**全部分组**（不受当前筛选影响）的显示顺序里循环，切到目标组即等于「锁定它」——
   * 分组筛选跟随切换，并展开该组、选中其组头。
   * ⚠️ 必须从 `sortGroups(this.groups)` 取全量：筛选生效后 `displayGroups` 只剩当前组，找不到"下一组"。
   */
  private _switchGroup(delta: number): void {
    const all = this.sortGroups(this.groups)
    if (all.length === 0) return
    const n = all.length
    // 当前位置：数字锁定 或 手动从下拉选的分组都算（否则手动选组后 → 会从第 1 组重来）
    const curName = this._focusedGroupName
    const cur = curName === null ? -1 : all.findIndex(g => g.name === curName)
    const next = cur < 0 ? (delta > 0 ? 0 : n - 1) : ((cur + delta) % n + n) % n
    const g = all[next]
    if (!g) return
    this.groupLockNo = next + 1
    this.groupLockName = g.name
    this.filterGroup = g.name || '__ungrouped__'
    this._reapplyGroupLock()       // 幂等：展开目标组 + 同步筛选
    setTimeout(() => {
      this.keyNavIndex = this.keyNavRows.findIndex(r => r.kind === 'group' && r.name === g.name)
      this._scrollKeyNavIntoView()
    }, 0)
  }

  /**
   * 当前「已聚焦的单一分组」名（`''` = 未分组）；`null` = 未聚焦（全部分组 / 自动）。
   * 两种来源都算聚焦：① 按数字锁定（groupLockName）② **手动从分组下拉选了具体分组**（filterGroup）。
   * ⚠️ 手动选组必须有这个语义，否则用户选了分组后按数字会被当成"选分组"，表现为毫无反应。
   */
  private get _focusedGroupName(): string | null {
    if (this.groupLockName !== null) return this.groupLockName
    if (this.filterGroup && this.filterGroup !== '__auto__') {
      return this.filterGroup === '__ungrouped__' ? '' : this.filterGroup
    }
    return null
  }

  /** 某个分组下的命令（按组名直接取，不依赖 displayGroups / 展开状态） */
  private _commandsOfGroup(name: string): QuickCommand[] {
    return this.svc.getAll().filter(c => (c.group || '') === name)
  }

  /** 确保某分组展开；返回是否真的展开了（调用方据此决定要不要等一帧再定位） */
  private _ensureGroupExpanded(name: string): boolean {
    const g = this.svc.getGroups().find(x => x.name === name)
    if (!g || g.expanded) return false
    this._applyingLock = true
    try {
      this.svc.toggleGroupExpanded(name)
      this.groups = this.svc.getGroups()
      this.onSearch()
    } finally {
      this._applyingLock = false
    }
    return true
  }

  private _applyNumber(n: number): void {
    this._dbg?.info?.(`apply n=${n} lock=${JSON.stringify(this.groupLockName)} filter=${JSON.stringify(this.filterGroup)} groups=${this.displayGroups.length}`)
    const focused = this._focusedGroupName
    // 未聚焦任何单组 ⇒ 数字 = 选择第 n 个分组（锁定 + 筛选切换）
    if (focused === null) {
      const g = this.displayGroups[n - 1]
      if (!g) return
      this.groupLockNo = n
      this.groupLockName = g.name
      // ⚠️ 必须用下拉框的哨兵值：未分组的 name 是空串，直接赋给 filterGroup 会被当成「全部分组」
      this.filterGroup = g.name || '__ungrouped__'
      // 展开 + 再确认筛选统一交给 _reapplyGroupLock（幂等，能扛住 reload 覆盖）
      this._reapplyGroupLock()
      setTimeout(() => {
        this.keyNavIndex = this.keyNavRows.findIndex(r => r.kind === 'group' && r.name === g.name)
        this._scrollKeyNavIntoView()
      }, 0)
      return
    }
    // 已聚焦某组（含手动选的）⇒ 数字 = 该组第 n 个命令
    const cmd = this._commandsOfGroup(focused)[n - 1]
    if (!cmd) return
    // 组收起时 keyNavRows 里没有它的命令 ⇒ 先展开，等渲染后再定位
    if (this._ensureGroupExpanded(focused)) {
      setTimeout(() => this._locateCommand(cmd), 40)
      return
    }
    this._locateCommand(cmd)
  }

  /** 把选中定位到指定命令（配合 keyNavIndex 高亮 + 就近滚动） */
  private _locateCommand(cmd: QuickCommand): void {
    const idx = this.keyNavRows.findIndex(r => r.kind === 'cmd' && !!r.cmd && r.cmd.id === cmd.id)
    if (idx >= 0) {
      this.keyNavIndex = idx
      this._scrollKeyNavIntoView()
    }
  }

  /** 锁定状态下当前组的命令（锁定即把筛选切到该组，故 displayGroups 只剩它） */
  private _lockedGroupCommands(): QuickCommand[] {
    return this.groupLockName === null ? [] : this._commandsOfGroup(this.groupLockName)
  }

  /** 退出分组锁定（筛选回到「全部分组」） */
  /**
   * 解除分组锁定。clearFilter = true 时同时把分组筛选清回「全部分组」。
   * ⚠️ 早退判断必须涵盖「没按数字锁定、但手动在下拉里选过分组」的情况，
   *    否则连按两次反引号清不掉筛选（用户明确要求：双击应回到「全部分组」）。
   */
  unlockGroup(clearFilter = true): void {
    const hasLock = this.groupLockNo !== null || this.groupLockName !== null
    if (!hasLock && !(clearFilter && this.filterGroup)) return
    this.groupLockNo = null
    this.groupLockName = null
    if (clearFilter) this.filterGroup = ''
    this.onSearch()
  }

  /** 展开/收起所有分组（true = 全部展开）。走 service 的批量方法，避免逐个 toggle 触发多次 reload */
  private _setAllGroupsExpanded(expanded: boolean): void {
    this._applyingLock = true
    try {
      this.svc.setAllGroupsExpanded(expanded)
      this.groups = this.svc.getGroups()
      this.keyNavIndex = -1
      this.onSearch()
    } finally {
      this._applyingLock = false
    }
  }

  /** 键盘可选的扁平行序列（分组头 + 已展开分组下的命令），顺序与界面一致 */
  get keyNavRows(): Array<{ kind: string; name?: string; cmd?: QuickCommand }> {
    const rows: Array<{ kind: string; name?: string; cmd?: QuickCommand }> = []
    for (const g of this.displayGroups) {
      rows.push({ kind: 'group', name: g.name })
      if (g.expanded) {
        for (const c of this.getGroupCommands(g.name)) rows.push({ kind: 'cmd', cmd: c })
      }
    }
    return rows
  }

  isKeyActiveGroup(name: string): boolean {
    const row = this.keyNavRows[this.keyNavIndex]
    return !!row && row.kind === 'group' && row.name === name
  }

  isKeyActiveCmd(cmd: QuickCommand): boolean {
    const row = this.keyNavRows[this.keyNavIndex]
    return !!row && row.kind === 'cmd' && !!row.cmd && row.cmd.id === cmd.id
  }

  /**
   * 全局布局下按「当前激活标签」推断连接标识（profileId 优先，回退 ssh:host）。
   * 局部布局直接用打开面板时绑定的 profileId（面板本身就属于那个标签）。
   * ⚠️ 「自动」分组筛选依赖它 —— 不跟随当前标签的话，切标签后会显示别的连接的分组。
   */
  private _activeProfileId(): string {
    if (this.svc.getLayoutMode() !== 'global') return this.profileId
    const t: any = this.app?.activeTab
    if (!t) return this.profileId
    const ssh = t.sshSession ?? t.session ?? null
    let pid = t.profile?.id || ''
    if (!pid && ssh?.host) pid = 'ssh:' + ssh.host
    return pid || ''
  }

  /** 切换标签后刷新全局面板的上下文（连接标识 + 发送目标），让「自动」筛选与发送都跟手 */
  private _refreshForActiveTab(): void {
    if (this.destroyed) return
    const global = this.svc.getLayoutMode() === 'global'
    if (!global) return
    try {
      const t: any = this.app?.activeTab
      const term = t?.terminal || null
      if (term) this.terminalRef = term
      const pid = this._activeProfileId()
      this.profileId = pid
      this._dbg?.info?.(`refresh tab=${(t as any)?.constructor?.name || '?'} profile=${JSON.stringify(pid)} filter=${JSON.stringify(this.filterGroup)}`)
      this.onSearch()
      // 轮询回调可能落在 Angular zone 外，显式触发一次变更检测，确保列表真的重算
      try { this.cdr?.detectChanges?.() } catch { /* ignore */ }
    } catch { /* ignore */ }
  }

  private _tabChangeSub: any = null
  /** 轮询兜底：不同 Tabby 版本的 tab 切换事件名不一致，用低频轮询保证「自动」筛选一定跟手 */
  private _tabPollTimer: any = null
  private _lastSeenTab: any = null

  /** 开始轮询「当前激活标签」的变化（仅全局布局需要） */
  private _startTabPolling(): void {
    if (this._tabPollTimer || this.svc.getLayoutMode() !== 'global') return
    this._lastSeenTab = (this.app as any)?.activeTab ?? null
    this._tabPollTimer = setInterval(() => {
      if (this.destroyed) return
      const t: any = (this.app as any)?.activeTab ?? null
      if (t !== this._lastSeenTab) {
        this._lastSeenTab = t
        this._refreshForActiveTab()
      }
    }, 250)
  }

  /** 面板级键盘处理：弹窗/浮层打开时不接管，避免与菜单、对话框抢键 */
  /** 面板内可聚焦元素（排除面板根自身，且必须是可见的） */
  private panelFocusItems(): HTMLElement[] {
    try {
      const root = this.elRef?.nativeElement as HTMLElement
      if (!root) return []
      const panel = root.querySelector('.qc-panel') as HTMLElement | null
      const scope: HTMLElement = panel || root
      const list = Array.from(scope.querySelectorAll('input, select, textarea, button, [tabindex="0"]')) as HTMLElement[]
      // 排除面板根自身 + 只保留可见元素（隐藏/收起的元素不参与 Tab 循环）
      return list.filter(el => el !== scope && !!el.offsetParent)
    } catch { return [] }
  }

  /** Tab（back=true 时为 Shift+Tab）在面板内循环移动焦点 */
  moveFocusInPanel(back = false): void {
    const items = this.panelFocusItems()
    if (items.length === 0) return
    const cur = items.indexOf(document.activeElement as HTMLElement)
    let next: number
    if (cur < 0) {
      next = back ? items.length - 1 : 0
    } else {
      next = back ? (cur - 1 + items.length) % items.length : (cur + 1) % items.length
    }
    try { items[next].focus() } catch { /* ignore */ }
  }

  onPanelKeydown(event: KeyboardEvent): void {
    // 弹窗（模态）打开时不接管面板键盘 —— 但**不能**直接 return：
    // 焦点停在面板根（或弹窗未能抢到焦点）时，Enter/Esc 会被这里静默吞掉，
    // 表现为"弹窗开着，按回车/取消毫无反应"。改为代发到对应弹窗的确认/取消动作。
    if (this._anyModalOpen()) {
      this._routeModalKey(event)
      return
    }
    // 长按 Enter 的系统自动重复不重复执行命令：确认框关掉、焦点回到面板后，
    // 自动重复的 Enter 会把同一条命令再触发一次（"发送了又弹确认框"的另一半原因）
    if (event.key === 'Enter' && event.repeat) {
      event.preventDefault()
      return
    }
    // Tab / Shift+Tab：焦点只在面板内部循环，不要切到 Tabby 其它区域
    if (event.key === 'Tab') {
      event.preventDefault()
      this.moveFocusInPanel(event.shiftKey)
      return
    }
    // 下拉 / 标题栏右键菜单是轻量浮层：按键先把它关掉再继续，
    // 不要静默吞掉（否则"按了数字没反应"——浮层还开着，用户根本看不出来）
    if (this.filterMenuOpen || this.titleMenuOpen || this.cmdMenuOpen) {
      if (event.key === 'Escape') {
        event.preventDefault()
        this.filterMenuOpen = false
        this.titleMenuOpen = false
        this.closeCmdMenu()
        return
      }
      this.filterMenuOpen = false
      this.titleMenuOpen = false
      this.closeCmdMenu()
    }
    // 搜索框回车等已由子元素处理（会 preventDefault），这里不再重复
    if (event.defaultPrevented) return
    const rows = this.keyNavRows
    if (rows.length === 0 && event.key !== 'Escape') return

    // 输入框内：除 ↑↓ 导航外一律保持原生行为（否则搜索词打不出空格/数字）
    const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase()
    const inInput = tag === 'input' || tag === 'textarea'
    if (inInput && event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return

    // 反引号（数字 1 左边）：单按 = 退出分组锁定；300ms 内连按两次 = 收起所有分组
    if (event.key === '`') {
      event.preventDefault()
      if (!this._tickTimer) {
        // 单按：展开所有分组 + 退出分组锁定（与「连按两次收起」对称）
        this._tickTimer = setTimeout(() => {
          this._tickTimer = null
          this.unlockGroup(false)   // 单按只解锁定，不动筛选（展开全部 ≠ 清筛选）
          this._setAllGroupsExpanded(true)
        }, 300)
      } else {
        clearTimeout(this._tickTimer)
        this._tickTimer = null
        // 连按两次：清掉分组筛选（回到「全部分组」）**并**收起所有分组
        this.unlockGroup()
        this._setAllGroupsExpanded(false)
      }
      return
    }

    // 数字 0 连按两次 = 与「``」相同的重置：清分组筛选 + 收起全部分组
    // ⚠️ 仅在数字缓冲为空时接管，否则「10」这类多位数输入会被吃掉
    if (event.key === '0' && !this.numBuffer && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      if (!this._zeroTimer) {
        this._zeroTimer = setTimeout(() => { this._zeroTimer = null }, 300)
      } else {
        clearTimeout(this._zeroTimer)
        this._zeroTimer = null
        this.unlockGroup()
        this._setAllGroupsExpanded(false)
      }
      return
    }

    // 数字（两段式）：未锁定分组 ⇒ 锁定该分组并把筛选切到它；已锁定 ⇒ 选中组内第 n 个命令
    // 无需按回车：停顿 320ms 自动提交（继续输入多位则本次重新计时）；回车立即提交
    if (this.numBuffer && event.key === 'Enter') {
      event.preventDefault()
      this._commitNumBuffer()
      return
    }
    if (this.numBuffer && event.key === 'Escape') {
      event.preventDefault()
      this.numBuffer = ''
      this._clearNumTimer()
      if (this._applyTimer) { clearTimeout(this._applyTimer); this._applyTimer = null }
      return
    }
    if (/^[0-9]$/.test(event.key) && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault()
      this.numBuffer = (this.numBuffer + event.key).slice(0, 3)
      this._resetNumTimer()
      if (this._applyTimer) clearTimeout(this._applyTimer)
      this._applyTimer = setTimeout(() => {
        this._applyTimer = null
        this._commitNumBuffer()
      }, 320)
      return
    }

    if (event.key === 'Escape') {
      event.preventDefault()
      this.doClose()
      return
    }

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const down = event.key === 'ArrowDown'
      if (this.keyNavIndex < 0) this.keyNavIndex = down ? 0 : rows.length - 1
      else this.keyNavIndex = down
        ? Math.min(this.keyNavIndex + 1, rows.length - 1)
        : Math.max(this.keyNavIndex - 1, 0)
      this._scrollKeyNavIntoView()
      return
    }

    // ← → 切换分组：按全部分组的显示顺序循环切换（分组筛选跟随），并展开、选中目标组
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault()
      this._switchGroup(event.key === 'ArrowRight' ? 1 : -1)
      return
    }

    if (event.key === 'Enter' || event.key === ' ') {
      const row = rows[this.keyNavIndex]
      // 没有键盘选中行时，回退到当前搜索结果的第一条（与搜索框回车同义）：
      // 否则「刚聚焦面板、还没按 ↑↓ 就按 Shift/Alt+Enter」会静默无反应
      if (!row) {
        // 回退到搜索结果第一条，语义与行/快捷栏/搜索框一致（收口在 runFirstCmdFromPanelKey）
        this.runFirstCmdFromPanelKey(event)
        return
      }
      if (row.kind === 'group') {        // 分组行：展开/收起；行序列随之变化，需把选中重新锚定到该分组头
        event.preventDefault()
        const name = row.name || ''
        this.toggleGroup(name)
        setTimeout(() => {
          this.keyNavIndex = this.keyNavRows.findIndex(r => r.kind === 'group' && r.name === name)
        }, 0)
        return
      }
      const cmd = row.cmd
      if (!cmd) return
      // 单独回车 = 仅发送；Ctrl/Cmd = 发送并执行；Alt = 当前标签强制确认；Shift = 广播（收口在同一处）
      this.runCmdFromPanelKey(cmd, event)
    }
  }

  /** 让键盘选中行滚入可视区（block:nearest 不会整页跳动） */
  private _scrollKeyNavIntoView(): void {
    setTimeout(() => {
      try {
        const row = this.keyNavRows[this.keyNavIndex]
        if (!row) return
        const list = this.listRef?.nativeElement as HTMLElement | null
        const sel = row.kind === 'cmd' && row.cmd
          ? `.qc-cmd-row[data-cmd-id="${row.cmd.id}"]`
          : `.qc-group-header[data-group-name="${CSS.escape(row.name || '')}"]`
        const el = list?.querySelector(sel) as HTMLElement | null
        el?.scrollIntoView({ block: 'nearest' })
      } catch { /* ignore */ }
    }, 0)
  }

  /** 把焦点交回面板根（弹窗关闭后必须调用，否则方向键/回车等快捷键全部失效） */
  focusPanel(): void {
    // 延迟一帧：弹窗是 *ngIf 立即移除，同步 focus 会被紧随的 DOM 更新打断
    setTimeout(() => {
      try {
        const el = this.elRef?.nativeElement?.querySelector?.('.qc-panel') as HTMLElement | null
        el?.focus()
      } catch { /* ignore */ }
    }, 0)
  }

  /**
   * 面板内「对某条命令按回车」的唯一语义（列表行 / 固定快捷栏 / 搜索框共用）：
   *   单独回车      = 仅发送（sendToLine：末尾不补回车，命令停在输入行等用户确认）
   *   Ctrl/Cmd+回车 = 发送并执行
   *   Alt+回车      = 只发当前标签，强制先确认
   *   Shift+回车    = 广播到所有已连接标签（强制确认）
   * ⚠️ 快捷栏芯片原先各自绑了两次 keydown.enter 且直接 executeCommand（= 鼠标点击语义），
   *    Tab 聚焦到芯片后敲回车会直接执行、甚至重复发送；统一收口到这里，避免各入口再各写一套。
   */
  runCmdFromPanelKey(cmd: QuickCommand, event?: KeyboardEvent): void {
    if (!cmd) return
    if (event) {
      event.preventDefault()
      // 必须拦冒泡：否则同一次回车还会冒到面板根，把"键盘选中行"再发一遍
      event.stopPropagation()
    }
    if (event?.shiftKey) { this.executeOnAllTabs(cmd); return }
    if (event?.altKey) { this.executeOnCurrentTab(cmd); return }
    if (event?.ctrlKey || event?.metaKey) { this.executeAlways(cmd); return }
    this.sendToLine(cmd)
  }

  /** 搜索框回车：取当前搜索结果第一条，语义与列表行完全一致（单独回车 = 仅发送） */
  runFirstCmdFromPanelKey(event?: KeyboardEvent): void {
    const first = this.filteredCommands[0]
    if (!first) return
    this.runCmdFromPanelKey(first, event)
  }

  onQuickBarWheel(event: WheelEvent): void {
    const el = event.currentTarget as HTMLElement
    if (!el) return
    event.preventDefault()
    el.scrollLeft += event.deltaY
  }

  executeCommand(cmd: QuickCommand): void {
    if (!this.terminalRef) return
    // 「执行时确认」守卫（收口：列表行 / 快捷条 / 搜索回车 / 参数弹窗都经此）
    if (!this._passConfirm(cmd, false)) return
    if (cmd.params && cmd.params.length > 0) {
      this.paramModalCmd = cmd
      this.paramModalParams = [...cmd.params]
      this.paramModalValues = {}
      this.paramModalForceExecute = false
      this.showParamModal = true
      return
    }
    this.sendCommand(cmd, cmd.text, false)
  }

  executeAlways(cmd: QuickCommand): void {
    if (!this.terminalRef) return
    // 行内 ⏎「发送并执行」同样受「执行时确认」约束
    if (!this._passConfirm(cmd, true)) return
    if (cmd.params && cmd.params.length > 0) {
      this.paramModalCmd = cmd
      this.paramModalParams = [...cmd.params]
      this.paramModalValues = {}
      this.paramModalForceExecute = true
      this.showParamModal = true
      return
    }
    this.sendCommand(cmd, cmd.text, true)
  }

  /* ---- 执行前确认（命令勾选「执行时确认」时生效） ---- */
  /** 待确认执行的命令；非空即显示确认弹窗 */
  pendingConfirmCmd: QuickCommand | null = null
  /** 本次确认是为「广播到所有连接」而弹的（确认后走广播，而不是只发给当前终端） */
  private broadcastToAll = false
  /** 参数弹窗结束后继续广播 */
  private paramModalBroadcast = false
  /** 确认后要走的执行方式：true = 发送并执行（⏎），false = 普通执行 */
  private pendingConfirmForceExecute = false
  /** 刚在确认框点过「执行」的命令 id（只放行一次，用后立即失效，避免影响下一次执行） */
  private _confirmApprovedId = ''
  private _confirmApprovedForce = false

  /**
   * 确认守卫：返回 true = 可继续执行；false = 已弹出确认框、等待用户处理。
   * 未勾选「执行时确认」的命令直接放行。
   */
  private _passConfirm(cmd: QuickCommand, forceExecute: boolean): boolean {
    if (!cmd.confirmBeforeRun) return true
    if (this._confirmApprovedId && this._confirmApprovedId === cmd.id && this._confirmApprovedForce === forceExecute) {
      this._confirmApprovedId = ''
      this._confirmApprovedForce = false
      return true
    }
    this.pendingConfirmCmd = cmd
    this.pendingConfirmForceExecute = forceExecute
    this._focusModal('.qc-cmd-confirm-modal')
    return false
  }

  /** 确认框里的命令预览：多步骤命令按启用顺序拼成多行 */
  get pendingConfirmPreview(): string {
    const cmd = this.pendingConfirmCmd
    if (!cmd) return ''
    if (cmd.steps && cmd.steps.length > 0) {
      return cmd.steps.filter(s => s.enabled !== false).map(s => s.text).filter(Boolean).join('\n')
    }
    return cmd.text || ''
  }

  /* ---- 统一确认面板：执行前确认 + 多步拼接提示 共用同一套标题/版式 ---- */

  /** 命令名称（确认前先看清是哪条；直接发送的裸文本没有名称，此时不显示该行） */
  get commandConfirmName(): string {
    return this.pendingConfirmCmd?.name || this.multiStepCmd?.name || ''
  }

  /** 说明文案按来源切换：执行前确认 / 多步拼接 */
  get commandConfirmMessage(): string {
    if (this.pendingConfirmCmd) return this.i18n.t('confirm.message')
    return this.i18n.t('panel.multi_step_hint', { count: this.multiStepCount })
  }

  /** 预览按来源切换：执行前确认逐行展示，多步拼接展示拼成的一行 */
  get commandConfirmPreview(): string {
    return this.pendingConfirmCmd ? this.pendingConfirmPreview : this.multiStepPreview
  }

  /** 统一确认：按当前来源分派（确认后各自走原有链路，不在这里复制逻辑） */
  confirmCommandConfirm(): void {
    if (this.pendingConfirmCmd) { this.confirmPendingRun(); return }
    this.confirmMultiStepJoin()
  }

  /** 统一取消：按当前来源分派 */
  cancelCommandConfirm(): void {
    if (this.pendingConfirmCmd) { this.cancelPendingRun(); return }
    this.cancelMultiStepHint()
  }

  confirmPendingRun(): void {
    const cmd = this.pendingConfirmCmd
    const force = this.pendingConfirmForceExecute
    const broadcast = this.broadcastToAll
    this.pendingConfirmCmd = null
    if (!cmd) return
    // 广播模式：确认后发给所有已连接标签页（带参命令先填参，填完继续广播）
    if (broadcast) {
      this.broadcastToAll = false
      if (cmd.params && cmd.params.length > 0) {
        this.paramModalCmd = cmd
        this.paramModalParams = [...cmd.params]
        this.paramModalValues = {}
        this.paramModalForceExecute = true
        this.paramModalBroadcast = true
        this.showParamModal = true
        return
      }
      this._broadcastCommand(cmd, null, true)
      return
    }
    this._confirmApprovedId = cmd.id
    this._confirmApprovedForce = force
    if (force) this.executeAlways(cmd)
    else this.executeCommand(cmd)
  }

  cancelPendingRun(): void {
    this.pendingConfirmCmd = null
    this.pendingConfirmForceExecute = false
    this.broadcastToAll = false
    // 取消确认后把焦点还给面板，否则后续快捷键全部失效
    this.focusPanel()
  }

  /**
   * Shift+回车：把命令**发送并执行到所有已连接的标签页**。
   * 无论命令是否勾选「执行时确认」，这里都**强制**先弹确认框（批量操作不可撤销）。
   */
  executeOnAllTabs(cmd: QuickCommand): void {
    const tabs = this._connectedTabs()
    this._dbg?.info?.(`executeOnAllTabs name=${JSON.stringify(cmd?.name || '')} conn=${tabs.length} rawTabs=${(((this.app as any)?.tabs) || []).length} app=${!!this.app}`)
    if (tabs.length === 0) {
      // 兜底：枚举不到已连接标签时退化成「当前标签强制确认」，
      // 绝不静默无反应（用户按了 Shift+Enter 却什么都不发生，最难排查）
      this._dbg?.info?.('executeOnAllTabs: no connected tabs -> fallback to current tab')
      this.executeOnCurrentTab(cmd)
      return
    }
    this.broadcastToAll = true
    this.pendingConfirmCmd = cmd
    this.pendingConfirmForceExecute = true
    this._focusModal('.qc-cmd-confirm-modal')
  }

  /**
   * Alt+回车：只作用于**当前标签页**，但无论命令是否勾选「执行时确认」都强制先确认
   * （用途：执行前先看清这条命令到底会发什么）。确认后走原有 executeAlways 链路。
   */
  executeOnCurrentTab(cmd: QuickCommand): void {
    if (!this.terminalRef) return
    this.broadcastToAll = false
    this.pendingConfirmCmd = cmd
    this.pendingConfirmForceExecute = true
    this._focusModal('.qc-cmd-confirm-modal')
  }

  /** 当前是否有弹窗（模态）打开 —— 面板根键盘守卫 / 文档捕获兜底的统一判据 */
  private _anyModalOpen(): boolean {
    return !!(this.showEditModal || this.showParamModal || this.showGroupRename || this.showMultiStepHint ||
      this.showConfirmModal || this.pendingConfirmCmd || this.showHistory)
  }

  /**
   * 面板根键盘守卫：弹窗打开时把 Enter / Esc **代发**到对应弹窗的确认 / 取消动作。
   * 焦点停在面板根时，Angular 绑在弹窗 div 上的 (keydown.enter)/(keydown.escape) 收不到事件
   * （按键目标在面板根，根本不经过弹窗），以前这里直接 return ⇒ 按键被静默吞掉。
   */
  private _routeModalKey(event: KeyboardEvent): void {
    const key = event.key
    if (key !== 'Enter' && key !== 'Escape') return
    // 长按的自动重复不再代发：否则按住回车会把「确认 → 发送」连续触发多次
    if (event.repeat) return
    // 焦点在输入类元素里时不代发：保留原生编辑行为（弹窗自身的绑定会处理回车）
    const tag = (event.target as HTMLElement | null)?.tagName?.toLowerCase()
    if (tag === 'input' || tag === 'textarea' || tag === 'select') return
    let handled = false
    // 优先级按 z-index / 弹出顺序：后弹的框在最上层，也最该收到按键
    // 命令执行确认（执行前确认 / 多步拼接已合并为同一面板）
    if (this.pendingConfirmCmd || this.showMultiStepHint) {
      handled = true
      if (key === 'Enter') this.confirmCommandConfirm(); else this.cancelCommandConfirm()
    } else if (this.showConfirmModal) {
      handled = true
      if (key === 'Enter') this.doConfirmModal(); else this.cancelConfirmModal()
    } else if (this.showEditModal) {
      handled = true
      if (key === 'Enter') this.saveEditCmd(); else this.closeEditModal()
    } else if (this.showParamModal) {
      handled = true
      if (key === 'Enter') this.confirmParamModal(); else this.closeParamModal()
    } else if (this.showGroupRename) {
      handled = true
      if (key === 'Enter') this.confirmGroupRename(); else this.closeGroupRename()
    } else if (this.showHistory) {
      // 执行记录没有"回车确认"语义，只接 Esc 关闭（下拉展开时先收下拉）
      handled = key === 'Escape'
      if (key === 'Escape') this.closeHistoryOrMenu()
    }
    if (!handled) return
    event.preventDefault()
    event.stopPropagation()
    // 动作后弹窗仍开着（如编辑框校验未过）时，把焦点真正送进去，后续按键直达
    if (this._anyModalOpen()) this._focusModal('.qc-edit-modal')
    this._dbg?.info?.(`routeModalKey key=${key} target=${tag || '?'} hist=${this.showHistory} ms=${this.showMultiStepHint} conf=${this.showConfirmModal} pend=${!!this.pendingConfirmCmd} edit=${this.showEditModal}`)
  }

  /**
   * 把焦点送进弹窗（selector 指向弹窗 div），使「回车确认 / Esc 取消」可用。
   * ⚠️ 一次性 setTimeout(0) 曾系统性失效（变更检测渲染晚于该宏任务 ⇒ querySelector 取空 ⇒
   * focus 落空 ⇒ 按键落在面板根被静默吞掉），这里改为多级重试：
   * setTimeout(0) 首试 → rAF（等一帧布局）→ setTimeout(60ms) 兜底，并留诊断日志。
   */
  private _focusModal(selector: string): void {
    const attempt = (left: number): void => {
      let el: HTMLElement | null = null
      try {
        el = this.elRef?.nativeElement?.querySelector?.(selector) as HTMLElement | null
      } catch { /* ignore */ }
      if (el) {
        try { el.focus() } catch { /* ignore */ }
        this._dbg?.info?.(`focusModal ok sel=${selector} left=${left}`)
        return
      }
      if (left <= 0) {
        this._dbg?.info?.(`focusModal MISS sel=${selector}`)
        return
      }
      if (left === 2) requestAnimationFrame(() => attempt(left - 1))
      else setTimeout(() => attempt(left - 1), 60)
    }
    setTimeout(() => attempt(2), 0)
  }

  /**
   * 文档捕获级按键兜底：弹窗打开时，即使焦点在面板根 / 终端 / body 上，
   * Enter / Esc 也送进弹窗（捕获阶段先于 xterm 等目标自身 handler，stopPropagation 后终端收不到）。
   * 焦点已在某个弹窗内部（含其输入框）时不介入 —— 弹窗自身的 (keydown.enter/escape) 绑定会处理，
   * 避免同一按键被确认两次。
   */
  private _docKeydownCapture = (event: KeyboardEvent): void => {
    if (!this._anyModalOpen()) return
    if (event.key !== 'Enter' && event.key !== 'Escape') return
    const target = event.target as HTMLElement | null
    try {
      if (target?.closest?.('.qc-edit-modal')) return
    } catch { /* ignore */ }
    this._routeModalKey(event)
  }

  /**
   * 展开成「真正的终端标签」列表。
   * ⚠️ `app.tabs` 里装的可能是**分裂容器**（SplitTabComponent）——它自己没有 session，
   * 真正的终端藏在 `getAllTabs()` 里。只按 `t.session` 过滤会把整个分裂当成"没有已连接标签"，
   * 于是 Shift+Enter 广播命中 `length === 0` 静默返回，**连确认框都不弹**（用户实测 2026-10-24）。
   */
  private _allTerminalTabs(): any[] {
    const out: any[] = []
    const seen = new Set<any>()
    const visit = (t: any): void => {
      if (!t || seen.has(t)) return
      seen.add(t)
      // 分裂容器：递归展开（getAllTabs 可能含自身，靠 seen 防环）
      if (typeof t.getAllTabs === 'function') {
        try {
          const kids = t.getAllTabs()
          if (Array.isArray(kids) && kids.length) { kids.forEach(visit); return }
        } catch { /* ignore */ }
      }
      // 兜底：部分版本只暴露 children / splitRoot.children
      const kids2 = Array.isArray(t.children) ? t.children : (t.splitRoot?.children as any[])
      if (Array.isArray(kids2) && kids2.length) { kids2.forEach(visit); return }
      if (t.session) out.push(t)
    }
    for (const t of ((this.app as any)?.tabs || [])) visit(t)
    return out
  }

  /** 所有「已正常连接」的终端标签页（含分裂容器里的那些） */
  private _connectedTabs(): any[] {
    return this._allTerminalTabs().filter(t => {
      const s = t?.session
      return !!s && s.open !== false
    })
  }

  /**
   * 广播：直接写各标签页的 session 数据通道（不经当前终端的输入模拟）。
   * 单个 tab 写入失败不影响其它；多步骤命令合并成多行一次写入（步骤延迟在此不适用）。
   */
  private _broadcastCommand(cmd: QuickCommand, textOverride: string | null, exec: boolean): void {
    const steps = resolveSteps({ ...cmd, steps: cmd.steps, text: textOverride ?? cmd.text })
    const body = (steps.length > 0 ? steps.map(s => s.text).filter(Boolean).join('\n') : (textOverride ?? cmd.text ?? '')).trim()
    if (!body) return
    const tabs = this._connectedTabs()
    // 记录里写明**具体发到了哪些连接**（去重、保持顺序）：
    // 只写「2 tabs」等于没记 —— 事后根本看不出是哪些机器跑过（2026-10-28 用户反馈）。
    const targets = Array.from(new Set(tabs.map(t => this._targetOfTab(t)).filter(Boolean)))
    const targetLabel = targets.length > 0 ? targets.join(', ') : `${tabs.length} tabs`
    this._dbg?.info?.(`broadcast tabs=${tabs.length} exec=${exec} targets=${JSON.stringify(targetLabel)}`)
    this.svc.addExecRecord({ ts: Date.now(), name: cmd.name || '', text: body, mode: 'broadcast', target: targetLabel })
    const payload = exec ? body + '\r' : body
    let sent = 0
    for (const t of tabs) {
      try {
        // ⛔ 必须走标签自己的 sendInput（与单标签路径 sendLineText 完全一致）：
        //   `Session.write(data: Buffer)` 的签名要 Buffer，直接塞字符串在 SSH 会话上不生效，
        //   表现为「确认了、日志也记了 tabs=2，但两个标签里什么都没执行」（2026-10-28 用户实测）。
        if (typeof t.sendInput === 'function') {
          t.sendInput(payload)
        } else if (typeof t.write === 'function') {
          t.write(payload)
        } else {
          const s = t?.session
          if (!s) continue
          // 兜底：按底层签名传 Buffer（ssh2 的 channel.write 两种都收，但别赌字符串）
          const buf = typeof Buffer !== 'undefined' ? Buffer.from(payload, 'utf-8') : payload
          if (typeof s.write === 'function') s.write(buf as any)
          else continue
        }
        sent++
        // 每个标签**各发一条**：接收方按 session 对象引用匹配面板，
        // 只发一条的话「同一个 host 开了多个标签页」就只有第一个面板会刷。
        // exec=false（仅发送）不发 —— 命令没执行，刷新没有意义。
        if (exec) this._notifyPluginsOfExec(cmd, t?.sshSession || t?.session, !!t?.sshSession)
      } catch (e) {
        this._dbg?.info?.(`broadcast write failed: ${String((e as any)?.message || e)}`)
      }
    }
    this._dbg?.info?.(`broadcast sent=${sent}/${tabs.length} exec=${exec}`)
    // 广播不适用「回到面板」：一次发到多个标签，回面板没有明确归属 ⇒ 强制聚焦终端
    // （与单标签发送行为对齐：发完焦点进终端看结果，未常驻时面板随之收起）
    this.focusTerminal()
  }

  /**
   * 通知其它插件「刚才有一条命令执行了」（目前只有 SFTP+ 在听，用于刷新文件列表）。
   *
   * 设计要点：
   *   ① 事件是**无副作用**的 —— 没人监听就什么都不发生，所以判开关是唯一门槛；
   *   ② 命令级三态优先于全局：never 从不发、always 忽略全局、inherit/缺省跟随全局；
   *   ③ session 传**对象引用**（不可序列化）：接收方靠 `===` 锁定「哪台服务器的面板」，
   *      同一个 host 开多个标签页也能各自算一份；
   *   ④ isSsh=false 表示本地 shell，接收方据此改刷本地栏（本机磁盘只有一份）；
   *   ⑤ 任何异常都吞掉 —— 跨插件联动绝不能影响命令本身是否发出去。
   *
   * @param cmd 触发执行的命令（用于三态判定与日志；null 表示非命令触发）
   * @param session 命令所在终端的会话对象（SSH 会话或本地 session）
   * @param isSsh 是否 SSH 会话
   * @创建人：DD1024z + Deepseek-V4.1-Flash
   * @创建时间：2026-10-27
   */
  private _notifyPluginsOfExec(cmd: QuickCommand | null, session: any, isSsh: boolean): void {
    const mode = cmd?.notifyRefresh || 'inherit'
    if (mode === 'never') {
      this._dbg?.info?.('broadcast exec skipped: notifyRefresh=never')
      return
    }
    if (mode !== 'always' && !this.broadcastExecEvents) {
      this._dbg?.info?.('broadcast exec skipped: global switch off')
      return
    }
    try {
      window.dispatchEvent(new CustomEvent(QC_SFTP_REFRESH_EVENT, {
        detail: {
          source: 'qc-plus',
          session: session ?? null,
          isSsh: !!isSsh,
          hostLabel: this._recordTarget(),
          commandName: cmd?.name || '',
        },
      }))
      this._dbg?.info?.('broadcast exec -> sftp-plus refresh, cmd=' + JSON.stringify(cmd?.name || '') + ' ssh=' + !!isSsh)
    } catch (e) {
      this._dbg?.info?.('broadcast exec failed: ' + String(e))
    }
  }

  /** 当前终端的会话对象与「是否 SSH」（三个字段都要试：不同 Tabby 版本落点不同） */
  private _currentSessionRef(): { session: any; isSsh: boolean } {
    const ssh = this.terminalRef?.sshSession ?? null
    const session = ssh ?? this.terminalRef?.session ?? this.terminalRef?._session ?? null
    return { session, isSsh: !!ssh }
  }

  confirmParamModal(): void {
    if (!this.paramModalCmd) return
    let text = this.paramModalCmd.text
    const paramValues: Record<string, string> = {}
    for (const p of this.paramModalParams) {
      const val = this.paramModalValues[p] ?? ''
      paramValues[p] = val
      // #8 修复：参数值可能包含 shell 特殊字符，记录警告
      if (/[;&|`$(){}!#\n]/.test(val)) {
        console.warn('[QC+] Parameter value for "' + p + '" contains shell-special characters, which may cause unexpected behavior when executed.')
      }
      text = text.split('${' + p + '}').join(val)
    }
    // 广播模式（Shift+回车 + 带参命令）：填完参数后发给所有已连接标签页
    if (this.paramModalBroadcast) {
      this.paramModalBroadcast = false
      const cmd = this.paramModalCmd
      this.closeParamModal()
      if (cmd) this._broadcastCommand(cmd, text, true)
      return
    }
    this.sendCommand(this.paramModalCmd, text, this.paramModalForceExecute, paramValues)
    this.closeParamModal()
  }
  closeParamModal(): void {
    this.showParamModal = false
    this.paramModalCmd = null
    this.paramModalParams = []
    this.paramModalValues = {}
    // 弹窗关闭后把焦点还给面板，否则快捷键全部失效
    this.focusPanel()
  }

  sendToLine(cmd: QuickCommand): void {
    if (!this.terminalRef) return
    const steps = resolveSteps({ ...cmd, steps: cmd.steps, text: cmd.text })
    if (steps.length > 1) {
      this.multiStepCmd = cmd
      this.multiStepCount = steps.length
      this.multiStepPreview = steps.map(s => s.type === 'break' ? 'Ctrl+C' : (s.text || '')).filter(Boolean).join(' && ')
      this.showMultiStepHint = true
      // 焦点送进弹窗：否则 Enter/Esc 由面板根接管，弹窗收不到（多级重试见 _focusModal）
      this._focusModal('.qc-cmd-confirm-modal')
      return
    }
    this.sendLineText(steps[0]?.text || cmd.text, cmd.name)
  }

  confirmMultiStepJoin(): void {
    if (!this.multiStepCmd) return
    // 先取名称快照：下面 cancelMultiStepHint() 会把 multiStepCmd 清空
    const name = this.multiStepCmd.name || ''
    const steps = resolveSteps({ ...this.multiStepCmd, steps: this.multiStepCmd.steps, text: this.multiStepCmd.text })
    const joined = steps.map(s => s.text).filter(Boolean).join(' && ')
    if (joined) this.sendLineText(joined, name)
    this.cancelMultiStepHint()
  }

  cancelMultiStepHint(): void {
    this.showMultiStepHint = false
    this.multiStepCmd = null
    this.multiStepCount = 0
  }

  /**
   * 把文本直接送到终端（**末尾不加回车** = 仅发送，命令停在输入行等用户确认）。
   * @param name 命令名称快照 —— 写进执行记录，便于回头看"当时执行的是哪条命令"
   *   （命令后来改名也不影响历史记录：记录同时保留实际发送的文本）
   */
  private sendLineText(text: string, name = ''): void {
    this._dbg?.info?.(`sendLineText text=${JSON.stringify((text || '').slice(0, 60))} term=${!!this.terminalRef} destroyed=${this.destroyed}`)
    if (!text) return
    try {
      let sent = false
      if (typeof this.terminalRef.sendInput === 'function') {
        this.terminalRef.sendInput(text); sent = true
      } else if (typeof this.terminalRef.write === 'function') {
        this.terminalRef.write(text); sent = true
      } else {
        const ssh = this.terminalRef?.sshSession ?? this.terminalRef?._session ?? null
        if (ssh && typeof ssh.write === 'function') { ssh.write(text); sent = true }
      }
      if (!sent) {
        const hostEl = this.terminalRef?.element?.nativeElement as HTMLElement | null
        if (hostEl) {
          const input = hostEl.querySelector('.xterm-helper-textarea, .xterm textarea, textarea, input') as HTMLTextAreaElement | HTMLInputElement | null
          if (input) {
            input.focus(); input.value = text
            input.dispatchEvent(new Event('input', { bubbles: true }))
            sent = true
          }
        }
      }
      if (sent) {
        // 执行记录：仅发送（Enter）也记一条，便于回溯
        this.svc.addExecRecord({ ts: Date.now(), name, text, mode: 'send', target: this._recordTarget() })
        // 仅发送 ⇒ 命令还停在终端输入行，焦点必须回终端（见 applyFocusAfterExec 的 sentOnly）
        this.applyFocusAfterExec(true)
      }
    } catch (e) { console.warn('[QC+] sendLineText error', e) }
  }

  private sendCommand(cmd: QuickCommand, text: string, forceExecute = false, paramValues?: Record<string, string>): void {
    this._dbg?.info?.(`sendCommand name=${JSON.stringify(cmd?.name || '')} exec=${forceExecute} term=${!!this.terminalRef} destroyed=${this.destroyed}`)
    this.svc.incrementUsage(cmd.id)
    // 如果有参数值，同时替换步骤文本中的占位符
    let effectiveCmd = cmd
    if (paramValues && cmd.steps && cmd.steps.length > 0) {
      effectiveCmd = {
        ...cmd,
        steps: cmd.steps.map(s => {
          let stepText = s.text
          for (const [p, val] of Object.entries(paramValues)) {
            stepText = stepText.split('${' + p + '}').join(val ?? '')
          }
          return { ...s, text: stepText }
        }),
      }
    }
    const steps = resolveSteps({ ...effectiveCmd, steps: effectiveCmd.steps, text })
    if (steps.length === 0) return
    // 执行记录（广播在 _broadcastCommand 里单独记一条）
    this.svc.addExecRecord({
      ts: Date.now(),
      name: cmd.name || '',
      text,
      mode: forceExecute ? 'run' : 'send',
      target: this._recordTarget(),
    })
    this.executeSteps(cmd, steps, 0, forceExecute)
  }

  private sendRawBreak(onDone: () => void): void {
    try {
      const ctrlC = '\x03'
      let sent = false
      if (typeof this.terminalRef.sendInput === 'function') { this.terminalRef.sendInput(ctrlC); sent = true }
      else if (typeof this.terminalRef.write === 'function') { this.terminalRef.write(ctrlC); sent = true }
      else {
        const ssh = this.terminalRef?.sshSession ?? this.terminalRef?._session ?? null
        if (ssh && typeof ssh.write === 'function') { ssh.write(ctrlC); sent = true }
      }
      if (!sent) {
        const hostEl = this.terminalRef?.element?.nativeElement as HTMLElement | null
        if (hostEl) {
          const input = hostEl.querySelector('.xterm-helper-textarea, .xterm textarea, textarea, input') as HTMLTextAreaElement | HTMLInputElement | null
          if (input) {
            input.focus()
            input.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true }))
            input.dispatchEvent(new KeyboardEvent('keypress', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true }))
            input.dispatchEvent(new KeyboardEvent('keyup', { key: 'c', code: 'KeyC', ctrlKey: true, bubbles: true }))
          }
        }
      }
    } catch { /* ignore */ }
    setTimeout(onDone, 100)
  }

  private executeSteps(cmd: QuickCommand, steps: CommandStep[], idx: number, forceExecute = false): void {
    console.log('[QC+] executeSteps START idx=' + idx + ' steps.length=' + steps.length + ' destroyed=' + this.destroyed)
    if (this.destroyed) { console.log('[QC+] executeSteps ABORT destroyed'); return }
    if (idx >= steps.length) {
      console.log('[QC+] executeSteps DONE idx=' + idx + ' >= steps.length=' + steps.length)
      // 最后一步没补回车（appendCR=false 且非强制执行）⇒ 命令停在终端输入行，
      // 焦点必须留终端，否则焦点回面板后一次回车又会触发同一条命令（见 applyFocusAfterExec）
      const last = steps[steps.length - 1]
      const sentOnly = !!last && last.type !== 'break' && !forceExecute && cmd.appendCR === false
      // 只有命令真的执行了才广播（仅发送 ⇒ 命令还停在输入行，此时通知对面刷新只会白刷一轮）
      if (!sentOnly) {
        const { session, isSsh } = this._currentSessionRef()
        this._notifyPluginsOfExec(cmd, session, isSsh)
      }
      this.applyFocusAfterExec(sentOnly)
      return
    }

    const step = steps[idx]
    const line = step.text
    const isLast = idx === steps.length - 1
    const appendLine = forceExecute ? true : (isLast ? (cmd.appendCR !== false) : true)
    console.log('[QC+] executeSteps idx=' + idx + ' type=' + step.type + ' text=' + JSON.stringify(line.substring(0, 60)) + ' isLast=' + isLast + ' appendLine=' + appendLine)

    // break 类型：发送 Ctrl+C 中断
    if (step.type === 'break') {
      console.log('[QC+] executeSteps BREAK idx=' + idx + ' delay=' + (step.delaySeconds || 0))
      setTimeout(() => {
        // #4 修复：setTimeout 回调中检查 destroyed 防止竞态
        if (this.destroyed) return
        console.log('[QC+] executeSteps BREAK fire idx=' + idx)
        this.sendRawBreak(() => {
          console.log('[QC+] executeSteps BREAK onDone idx=' + idx)
          if (this.destroyed) return
          const nextDelay = step.delaySeconds || 0
          if (nextDelay > 0) { setTimeout(() => { if (!this.destroyed) this.executeSteps(cmd, steps, idx + 1, forceExecute) }, nextDelay * 1000) }
          else { this.executeSteps(cmd, steps, idx + 1, forceExecute) }
        })
      }, 150)
      return
    }

    try {
      let sent = false
      const payload = appendLine ? line + '\n' : line
      console.log('[QC+] executeSteps SEND idx=' + idx + ' payload=' + JSON.stringify(payload.substring(0, 80)))
      if (typeof this.terminalRef.sendInput === 'function') {
        this.terminalRef.sendInput(payload)
        sent = true
      } else if (typeof this.terminalRef.write === 'function') {
        this.terminalRef.write(payload)
        sent = true
      } else {
        const ssh = this.terminalRef?.sshSession ?? this.terminalRef?._session ?? null
        if (ssh && typeof ssh.write === 'function') { ssh.write(payload); sent = true }
      }
      if (!sent) {
        const hostEl = this.terminalRef?.element?.nativeElement as HTMLElement | null
        if (hostEl) {
          const input = hostEl.querySelector('.xterm-helper-textarea, .xterm textarea, textarea, input') as HTMLTextAreaElement | HTMLInputElement | null
          if (input) {
            input.focus(); input.value = line
            input.dispatchEvent(new Event('input', { bubbles: true }))
            if (appendLine) input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true }))
            sent = true
          }
        }
      }
      console.log('[QC+] executeSteps SENT idx=' + idx + ' sent=' + sent)
      if (!sent && idx === 0) console.warn('[QC+] No terminal input method available')
      if (idx + 1 < steps.length) {
        const nextDelay = step.delaySeconds || 0
        console.log('[QC+] executeSteps NEXT idx=' + idx + ' nextDelay=' + nextDelay + ' nextIdx=' + (idx + 1))
        // #4 修复：setTimeout 回调中检查 destroyed
        if (nextDelay > 0) { setTimeout(() => { if (!this.destroyed) this.executeSteps(cmd, steps, idx + 1, forceExecute) }, nextDelay * 1000) }
        else { this.executeSteps(cmd, steps, idx + 1, forceExecute) }
      } else {
        console.log('[QC+] executeSteps ALL_DONE idx=' + idx + ' -> focusTerminal')
        this.executeSteps(cmd, steps, idx + 1, forceExecute)
      }
    } catch (e) { console.warn('[QC+] executeSteps error', e) }
  }

  private focusTerminal(): void {
    try {
      const hostEl = this.terminalRef?.element?.nativeElement as HTMLElement | null
      if (!hostEl) return
      const input = hostEl.querySelector('.xterm-helper-textarea, .xterm textarea, textarea, input') as HTMLElement | null
      if (input) input.focus()
    } catch { /* ignore */ }
    // 命令执行完毕，检查是否需要自动关闭面板
    this.maybeClosePanel()
  }

  /**
   * 命令执行完毕后的焦点策略收口（sendLineText / executeSteps 全部走这里）。
   * @param sentOnly 仅发送（末尾没补回车，命令还停在终端输入行）。
   *   这种情况**必须**聚焦终端，不能回面板 —— 焦点回面板后用户再按一次回车就会把
   *   同一条命令重新执行一遍，表现为「确认 → 发送 → 又弹确认框」的循环（用户实测 2026-10-24）。
   * panel = 焦点回到面板（保留原选中行，可继续 ↑↓ 挑下一条）；其余一律聚焦终端。
   * 「回到面板」仅在面板常驻时生效：未常驻时面板反正要自动收起，
   * 若先把焦点给它，面板移除后焦点会落到 body 上，快捷键全失效。
   */
  private applyFocusAfterExec(sentOnly = false): void {
    if (sentOnly) {
      this.focusTerminal()
      return
    }
    if (this.focusAfterExec === 'panel' && this.pinPanel) {
      this.focusPanel()
      return
    }
    this.focusTerminal()
  }

  showEditModal = false
  editCmd: any = { name: '', text: '' }

  showParamModal = false
  paramModalCmd: QuickCommand | null = null
  paramModalParams: string[] = []
  paramModalValues: Record<string, string> = {}
  private paramModalForceExecute = false

  showGroupRename = false
  groupRenameIsNew = false
  groupRenameOldName = ''
  groupRenameValue = ''
  groupRenameOrder = 0
  groupRenameProfileIds: string[] = []
  availableProfiles: { id: string; name: string; host?: string; port?: number }[] = []

  /** 加载配置连接列表（仅在打开分组编辑弹窗时调用一次） */
  private loadAvailableProfiles(): void {
    if (this.availableProfiles.length > 0) return // 已加载
    try {
      let rawProfiles: { id: string; name: string; host: string; port: number; type?: string }[] = []

      // 优先从 config.yaml 读取（数据准确，不含冗余条目）
      if (typeof require !== 'undefined') {
        const fs = require('fs')
        const path = require('path')
        const os = require('os')
        const home = os.homedir()
        const configDir = process.platform === 'win32'
          ? (process.env.APPDATA || path.join(home, 'AppData', 'Roaming'))
          : process.platform === 'darwin'
            ? path.join(home, 'Library', 'Application Support')
            : path.join(home, '.config')
        const yamlPath = path.join(configDir, 'tabby', 'config.yaml')
        if (fs.existsSync(yamlPath)) {
          const raw = fs.readFileSync(yamlPath, 'utf-8')
          rawProfiles = this.parseYamlProfiles(raw)
          console.log('[QuickCmd+] 数据来源: config.yaml, ' + rawProfiles.length + ' 条')
        }
      }

      // 回退：localStorage（YAML 不可用时）
      if (rawProfiles.length === 0) {
        let cfg: any = null
        let sourceKey = ''
        for (const key of ['tabby-config', 'config', 'tabby-config.json']) {
          const raw = localStorage.getItem(key)
          if (!raw) continue
          try { cfg = JSON.parse(raw); sourceKey = key; break } catch {}
        }
        if (cfg) {
          const arr = cfg?.profiles || cfg?.hotkeys?.profiles || []
          if (Array.isArray(arr) && arr.length > 0) {
            rawProfiles = this.mapProfileArray(arr)
            console.log('[QuickCmd+] 数据来源: localStorage.' + sourceKey + ', ' + rawProfiles.length + ' 条')
          }
        }
      }

      // 最终处理：只保留远程连接, 按 name 去重, 生成唯一 id
      if (rawProfiles.length > 0) {
        // 过滤：必须有 host 或 type 为 ssh/telnet 的真实连接
        const validProfiles = rawProfiles.filter(p => p.host || (!p.host && (p.type === 'ssh' || p.type === 'telnet')))

        const seen = new Map<string, { id: string; name: string; host: string; port: number }>()
        for (const p of validProfiles) {
          const key = p.name
          const existing = seen.get(key)
          if (!existing) {
            // 设置默认端口
            seen.set(key, { ...p, port: p.port || this.getDefaultPort(p.type) })
          } else if (!existing.host && p.host) {
            seen.set(key, { ...p, port: p.port || this.getDefaultPort(p.type) })
          }
        }
        this.availableProfiles = Array.from(seen.values()).map((p, i) => ({
          ...p,
          id: p.id || `${p.name}|${p.host}|${p.port}|${i}`,
        }))
        console.log('[QuickCmd+] 最终 ' + this.availableProfiles.length + ' 条:', JSON.stringify(this.availableProfiles))
      }
    } catch (e) { console.error('[QuickCmd+] 加载 profiles 失败:', e) }
  }

  /** 解析 config.yaml 中的 profiles 数组 */
  private parseYamlProfiles(raw: string): { id: string; name: string; host: string; port: number; type: string }[] {
    const result: { id: string; name: string; host: string; port: number; type: string }[] = []
    const lines = raw.split('\n')
    let current: { id: string; name: string; host: string; port: number; type: string } | null = null
    let inProfiles = false
    let inOptions = false
    let profileIndent = -1

    for (const line of lines) {
      if (!inProfiles) {
        if (/^\s*profiles\s*:/.test(line)) { inProfiles = true }
        continue
      }
      // 非缩进的顶级 key → 退出 profiles
      if (!/^\s/.test(line) && line.trim() && !line.trim().startsWith('#')) {
        if (current?.name) result.push(current)
        break
      }

      // 缩进级别
      const indent = line.match(/^(\s*)/)?.[1].length ?? 0

      // 新 profile 项：同缩进的 '- '
      if (line.trim().startsWith('- ') && (profileIndent === -1 || indent === profileIndent)) {
        if (current?.name) result.push(current)
        if (profileIndent === -1) profileIndent = indent
        current = { id: '', name: '', host: '', port: 0, type: '' }
        inOptions = false
        const afterDash = line.replace(/^\s*-\s*/, '')
        if (afterDash.startsWith('type:')) {
          current.type = afterDash.replace(/^type:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
        } else if (afterDash.startsWith('name:')) {
          current.name = afterDash.replace(/^name:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
        } else if (afterDash.startsWith('id:')) {
          current.id = afterDash.replace(/^id:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
        }
        continue
      }
      if (!current) continue

      const trim = line.trim()
      const valuePart = trim.replace(/\s*#.*$/, '')

      if (valuePart.startsWith('id:')) {
        current.id = valuePart.replace(/^id:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
      } else if (valuePart.startsWith('name:')) {
        current.name = valuePart.replace(/^name:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
      } else if (valuePart.startsWith('type:') && !inOptions) {
        current.type = valuePart.replace(/^type:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
      } else if (valuePart.startsWith('options:')) {
        inOptions = true
      } else if (inOptions && valuePart.startsWith('host:')) {
        current.host = valuePart.replace(/^host:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()
      } else if (inOptions && valuePart.startsWith('port:')) {
        current.port = parseInt(valuePart.replace(/^port:\s*['"]?/, '').replace(/['"]\s*$/, '').trim()) || 0
      }
    }
    if (current?.name) result.push(current)

    // 按 name 去重（同名保留有 host 的）
    const seen = new Map<string, { id: string; name: string; host: string; port: number; type: string }>()
    for (const p of result) {
      const key = p.name
      const existing = seen.get(key)
      if (!existing) {
        seen.set(key, p)
      } else if (!existing.host && p.host) {
        seen.set(key, p)
      }
    }
    return Array.from(seen.values())
  }

  /** 根据连接类型返回默认端口 */
  private getDefaultPort(type: string): number {
    switch (type) {
      case 'ssh': return 22
      case 'telnet': return 23
      case 'serial': return 0
      case 'local': return 0
      default: return 0
    }
  }

  private mapProfileArray(arr: any[]): { id: string; name: string; host: string; port: number }[] {
    return arr
      .filter((p: any) => {
        // 过滤：必须有 name，且有 host 或有效的连接类型
        if (!p || !p.name) return false
        const host = p.options?.host || p.host || ''
        const type = p.options?.type || p.type || ''
        // 没有连接信息的 profile（如虚拟分组、内部 profile）不显示
        if (!host && !type) return false
        return true
      })
      .map((p: any, i: number) => ({
        id: String(p.id) || `${p.name}|${p.options?.host || p.host || ''}|${p.options?.port ?? p.port ?? 0}|${i}`,
        name: p.name,
        host: p.options?.host || p.host || '',
        port: p.options?.port ?? p.port ?? this.getDefaultPort(p.options?.type || p.type || ''),
      }))
  }

  showMultiStepHint = false
  multiStepCount = 0
  /** 多步确认框里预览的「拼接成一行」结果 */
  multiStepPreview = ''
  private multiStepCmd: QuickCommand | null = null

  addCommand(): void {
    this.editCmd = { name: '', shortName: '', text: '', group: '', appendCR: true, pinned: false, confirmBeforeRun: false, notifyRefresh: 'inherit', steps: [{ text: '', delaySeconds: 0, type: 'command', enabled: true }] }
    this.editGroupMenuOpen = false
    this.showEditModal = true
  }

  addCommandToGroup(groupName: string): void {
    this.editCmd = { name: '', shortName: '', text: '', group: groupName || '', appendCR: true, pinned: false, confirmBeforeRun: false, notifyRefresh: 'inherit', steps: [{ text: '', delaySeconds: 0, type: 'command', enabled: true }] }
    this.editGroupMenuOpen = false
    this.showEditModal = true
  }

  editCommand(cmd: QuickCommand): void {
    this.editCmd = JSON.parse(JSON.stringify(cmd))
    if (!this.editCmd.steps || this.editCmd.steps.length === 0) {
      if (this.editCmd.text) {
        const lines = this.editCmd.text.split('\n').map((l: string) => l.trim()).filter((l: string) => l.length > 0)
        const globalDelay = this.editCmd.delaySeconds || 0
        this.editCmd.steps = lines.map((line: string, i: number) => ({ text: line, delaySeconds: i < lines.length - 1 ? globalDelay : 0, enabled: true }))
      } else { this.editCmd.steps = [{ text: '', delaySeconds: 0, type: 'command', enabled: true }] }
    } else {
      this.editCmd.steps.forEach((s: any) => { if (s.enabled === undefined) s.enabled = true })
    }
    this.editGroupMenuOpen = false
    this.showEditModal = true
    // 等待 DOM 渲染后自动调整 textarea 高度
    setTimeout(() => {
      document.querySelectorAll('.qc-step-input').forEach(el => this.autoGrowElement(el as HTMLTextAreaElement))
    }, 50)
  }

  togglePin(cmd: QuickCommand): void {
    const next = !cmd.pinned
    this.svc.update(cmd.id, { pinned: next })
    cmd.pinned = next
    // 同步书签顺序：新钉住的排到末尾（符合直觉），取消钉住的移出顺序
    const ids = this.svc.getPinned().map(c => c.id).filter(id => id !== cmd.id)
    if (next) ids.push(cmd.id)
    this.svc.applyPinnedOrder(ids)
    this.loadData()
  }

  onResetUsage(): void {
    if (!this.editCmd?.id) return
    this.svc.update(this.editCmd.id, { usageCount: 0 })
    this.editCmd.usageCount = 0
  }

  get editCmdSteps(): CommandStep[] { return this.editCmd?.steps || [] }
  set editCmdSteps(v: CommandStep[]) { this.editCmd.steps = v }

  addStep(): void { this.editCmd.steps.push({ text: '', delaySeconds: 0, type: 'command', enabled: true }) }

  addBreakStep(): void { this.editCmd.steps.push({ text: '', delaySeconds: 1, type: 'break', enabled: true }) }

  autoGrow(event: Event): void { this.autoGrowElement(event.target as HTMLTextAreaElement) }

  private autoGrowElement(ta: HTMLTextAreaElement): void {
    ta.style.height = 'auto'
    ta.style.height = ta.scrollHeight + 'px'
  }

  removeStep(index: number): void {
    this.editCmd.steps.splice(index, 1)
    if (this.editCmd.steps.length === 0) this.editCmd.steps.push({ text: '', delaySeconds: 0 })
  }

  /* ---- 步骤拖拽排序 ---- */
  stepDragIdx: number | null = null

  onStepDragStart(event: DragEvent, idx: number): void {
    this.stepDragIdx = idx
    event.dataTransfer!.effectAllowed = 'move'
    // 使用 1x1 透明图像作为拖拽图像，防止横向滚动条
    const img = new Image()
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    event.dataTransfer!.setDragImage(img, 0, 0)
  }

  onStepDragOver(event: DragEvent, idx: number): void {
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'
    const el = event.currentTarget as HTMLElement
    const rows = el.parentElement?.querySelectorAll('.qc-step-row')
    rows?.forEach(r => r.classList.remove('drag-over', 'drag-over-bottom'))
    const rect = el.getBoundingClientRect()
    const y = event.clientY - rect.top
    if (y > rect.height / 2) {
      el.classList.add('drag-over-bottom')
    } else {
      el.classList.add('drag-over')
    }
  }

  onStepDragLeave(event: DragEvent): void {
    ;(event.currentTarget as HTMLElement).classList.remove('drag-over', 'drag-over-bottom')
  }

  onStepDragEnd(): void {
    this.stepDragIdx = null
    document.querySelectorAll('.qc-step-row.drag-over, .qc-step-row.drag-over-bottom').forEach(el => el.classList.remove('drag-over', 'drag-over-bottom'))
  }

  onStepDrop(event: DragEvent, idx: number): void {
    event.preventDefault()
    if (this.stepDragIdx === null) { this.onStepDragEnd(); return }
    const steps = this.editCmd.steps
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect()
    const y = event.clientY - rect.top
    const dropAfter = y > rect.height / 2
    let targetIdx = idx
    if (dropAfter) targetIdx = idx + 1
    if (this.stepDragIdx === targetIdx || this.stepDragIdx === targetIdx - 1) { this.onStepDragEnd(); return }
    const [moved] = steps.splice(this.stepDragIdx, 1)
    const insertAt = this.stepDragIdx < targetIdx ? targetIdx - 1 : targetIdx
    steps.splice(insertAt, 0, moved)
    this.onStepDragEnd()
  }

  saveEditCmd(): void {
    if (!this.editCmd.name || !this.editCmd.name.trim()) return
    const steps = this.editCmd.steps || []
    const text = steps.map((s: CommandStep) => s.text).join('\n')
    if (!text.trim()) return
    const updateData = {
      name: this.editCmd.name.trim(),
      // 简称：仅用于固定快捷入口显示，留空则快捷条回退显示命令名称
      shortName: (this.editCmd.shortName || '').trim(),
      text: text.trim(), group: this.editCmd.group || '',
      appendCR: this.editCmd.appendCR !== false, pinned: !!this.editCmd.pinned,
      confirmBeforeRun: !!this.editCmd.confirmBeforeRun,
      // 三态归一化：只认 always / never，其它（含 undefined）一律落回 inherit
      notifyRefresh: (this.editCmd.notifyRefresh === 'always' || this.editCmd.notifyRefresh === 'never')
        ? this.editCmd.notifyRefresh : 'inherit',
      sendCtrlC: false, sendCtrlCAfter: false, // 步骤模式下清除旧版兼容字段，避免 resolveSteps 追加重复 break
      steps: steps.map((s: CommandStep) => ({ text: s.text, delaySeconds: Math.max(0, +(s.delaySeconds || 0)), type: s.type || 'command', enabled: s.enabled !== false })),
    }
    if (this.editCmd.id) { this.svc.update(this.editCmd.id, updateData) }
    else {
      // 带上编辑对象里的参数占位符与 SSH 关联：「拷贝新建命令」要继承它们；
      // 全新命令这两个字段本来就是空，行为不变（编辑弹窗里也没有这两项的编辑入口）。
      this.svc.add({
        ...updateData,
        params: (this.editCmd.params || []) as any[],
        sshProfiles: (this.editCmd.sshProfiles || []) as any[],
      })
    }
    this.showEditModal = false; this.searchText = ''; this.loadData()
  }

  closeEditModal(): void { this.showEditModal = false; this.editGroupMenuOpen = false; this.focusPanel() }

  getParamBadge(cmd: QuickCommand): string {
    const count = cmd.params?.length || 0
    return count > 1 ? `${count} vars` : '${...}'
  }

  private dragCmdId: string | null = null
  listDropOver = false

  onDragStart(event: DragEvent, cmd: QuickCommand): void {
    this.dragCmdId = cmd.id
    // 兜底：先清掉上一轮可能残留的插入指示与拖拽样式
    this.listDropOver = false
    this.cleanDragStyles()
    // 兜底：drop 后列表会按新顺序重排 *ngFor，拖拽源元素可能已被销毁，导致绑在它上面的 dragend
    // 不触发 → 插入指示永久残留（组末尾出现一条主色条）。在 document 上挂一次性 dragend，
    // 无论拖拽如何结束都保证清理（once:true 自动解绑，不会泄漏）。
    document.addEventListener('dragend', this._onAnyDragEnd, { once: true })
    event.dataTransfer?.setData('text/plain', cmd.id)
    event.dataTransfer!.effectAllowed = 'move'
    // 给列表添加 is-dragging 类，拖拽期间禁用所有 hover 展开
    if (this.listRef?.nativeElement) {
      this.listRef.nativeElement.classList.add('is-dragging')
    }
    // 使用预加载的 1x1 透明图像作为拖拽图像，避免默认快照过宽
    const img = new Image()
    img.onload = () => {
      event.dataTransfer?.setDragImage(img, 0, 0)
    }
    img.src = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'
    // 立即设置一次（onload 可能异步延迟，部分浏览器支持直接设置未加载图像）
    event.dataTransfer?.setDragImage(img, 0, 0)
  }

  private dragOverEl: HTMLElement | null = null

  onDragOver(event: DragEvent): void {
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'
    const el = event.currentTarget as HTMLElement
    // 只清理当前命令列表内的行（同分组），避免全局 querySelectorAll
    const rows = el.parentElement?.querySelectorAll('.qc-cmd-row')
    rows?.forEach(r => r.classList.remove('drag-over', 'drag-over-bottom'))
    const rect = el.getBoundingClientRect()
    const y = event.clientY - rect.top
    if (y > rect.height / 2) {
      el.classList.add('drag-over-bottom')
    } else {
      el.classList.add('drag-over')
    }
  }

  onDragLeave(event: DragEvent): void {
    (event.currentTarget as HTMLElement).classList.remove('drag-over', 'drag-over-bottom')
  }

  onDrop(event: DragEvent, targetCmd: QuickCommand): void {
    event.preventDefault(); event.stopPropagation(); this.cleanDragStyles()
    // 清掉组末尾的插入指示：拖拽经过组容器时 onListDragOver 会把它置 true，而本路径是行级 drop、
    // 不经过 onListDrop，若此处不清就会残留一条 4px 主色条（表现为「拖拽后底部多了一条 border」）
    this.listDropOver = false
    console.log('[QC+] onDrop srcId=' + (this.dragCmdId || '-') + ' target=' + targetCmd.name + ' targetId=' + targetCmd.id)
    const srcId = this.dragCmdId || event.dataTransfer?.getData('text/plain')
    if (!srcId || srcId === targetCmd.id) return
    const allCmds = this.commands
    const srcIdx = allCmds.findIndex(c => c.id === srcId)
    const tgtIdx = allCmds.findIndex(c => c.id === targetCmd.id)
    if (srcIdx === -1 || tgtIdx === -1) return
    const srcCmd = allCmds[srcIdx]
    if ((srcCmd.group || '') !== (targetCmd.group || '')) {
      this.svc.update(srcCmd.id, { group: targetCmd.group || '' })
      srcCmd.group = targetCmd.group || ''
    }
    // 检测鼠标位置决定插入到目标上方还是下方
    const el = event.currentTarget as HTMLElement
    const y = event.clientY - el.getBoundingClientRect().top
    const dropAfter = y > el.offsetHeight / 2
    const [moved] = allCmds.splice(srcIdx, 1)
    const adjustedTgt = tgtIdx > srcIdx ? tgtIdx - 1 : tgtIdx
    const insertAt = dropAfter ? adjustedTgt + 1 : adjustedTgt
    allCmds.splice(insertAt, 0, moved)
    this.svc.reorder(allCmds.map(c => c.id))
    // 直接从 service 同步，不调用 loadData（避免 reload 从 config 覆盖 reorder 结果）
    this.commands = this.svc.getAll()
    this.onSearch()
  }

  /* ---- 分组拖拽排序（长按分组头拖动） ---- */
  /** 正在拖拽的分组名；空串表示当前拖的是命令 */
  private _dragGroup = ''

  onGroupDragStart(event: DragEvent, name: string): void {
    if (this.sortMode !== 'manual') { event.preventDefault(); return }
    this._dragGroup = name
    try {
      event.dataTransfer?.setData('text/plain', 'group:' + (name || ''))
      if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    } catch { /* ignore */ }
  }

  onGroupDragEnd(): void { this._dragGroup = '' }

  /** 分组头 drop：拖的是分组 ⇒ 重排顺序；拖的是命令 ⇒ 归入该分组 */
  onGroupDrop(event: DragEvent, name: string): void {
    event.preventDefault()
    event.stopPropagation()
    const from = this._dragGroup
    if (!from) { this.onDropToGroup(event, name); return }
    this._dragGroup = ''
    if (from === name || this.sortMode !== 'manual') return
    const names = this.groups.map(g => g.name || '')
    const i = names.indexOf(from)
    const j = names.indexOf(name)
    if (i < 0 || j < 0) return
    names.splice(i, 1)
    names.splice(j, 0, from)
    this.svc.reorderGroups(names)
    this.loadData()
  }

  onDropToGroup(event: DragEvent, groupName: string): void {
    event.preventDefault(); this.cleanDragStyles()
    this.listDropOver = false
    const srcId = this.dragCmdId || event.dataTransfer?.getData('text/plain')
    if (!srcId) return
    const srcCmd = this.commands.find(c => c.id === srcId)
    if (!srcCmd || (srcCmd.group || '') === (groupName || '')) return
    this.svc.update(srcCmd.id, { group: groupName || '' })
    const allIds = this.commands.map(c => c.id)
    const idx = allIds.indexOf(srcId)
    if (idx !== -1) allIds.splice(idx, 1)
    allIds.push(srcId)
    this.svc.reorder(allIds)
    // 直接同步，不走 loadData 避免 reorder 被 config 覆盖
    this.commands = this.svc.getAll()
    this.groups = this.svc.getGroups()
    this.onSearch()
  }

  onDragEnd(event: DragEvent): void {
    this.dragCmdId = null
    this.cleanDragStyles()
    this.listDropOver = false
    if (this.listRef?.nativeElement) {
      this.listRef.nativeElement.classList.remove('is-dragging')
    }
  }

  /** document 级 dragend 兜底（由 onDragStart 以 once 方式挂载）：任何拖拽结束路径都清理插入指示 */
  private _onAnyDragEnd = (): void => {
    this.listDropOver = false
    // cleanDragStyles 内部是直接操作 DOM 类（不依赖变更检测），因此在 zone 外执行同样有效
    this.cleanDragStyles()
  }

  onListDragOver(event: DragEvent): void {
    event.preventDefault()
    event.dataTransfer!.dropEffect = 'move'
    this.listDropOver = true
  }

  onListDragLeave(event: DragEvent): void {
    this.listDropOver = false
  }

  /** 右键命令条目：直接进入编辑弹窗（省去双击 / 找编辑按钮） */
  /**
   * 菜单的 z-index。⛔ 不能写死：面板自身由装饰器 `bringFloatToFront` 动态分配
   * （`window.__tabbyFloatZ` 从 900 递增，写进 `.qc-panel` 的 inline style），
   * 而这些菜单是 `.qc-panel` 的**同级兄弟节点** ⇒ CSS 里写 70 / 1999 都会被面板盖住，
   * 表现就是「右键了但什么都看不到」（2026-10-28 用户实测）。
   * 打开时按「面板当前层级 + 1」绑定到 inline style。
   */
  cmdMenuZ = 901
  titleMenuZ = 901

  /** 取面板当前 z-index（读不到时按装饰器计数器起点 900 兜底） */
  private _panelZ(): number {
    try {
      const host = this.elRef?.nativeElement as HTMLElement | null
      const panelEl = host?.querySelector?.('.qc-panel') as HTMLElement | null
      const z = panelEl ? parseInt(panelEl.style.zIndex || '', 10) : NaN
      return Number.isFinite(z) ? z : 900
    } catch { return 900 }
  }

  /* ---- 命令右键菜单（操作方式为「右键菜单」或「两者都支持」时使用） ---- */
  cmdMenuOpen = false
  cmdMenuCmd: QuickCommand | null = null
  cmdMenuX = 0
  cmdMenuY = 0

  closeCmdMenu(): void {
    this.cmdMenuOpen = false
    this.cmdMenuCmd = null
    this._disarmMenuOutsideClose()
  }

  /** 菜单「点外部关闭」的 window 捕获监听（打开菜单时挂，关闭时摘） */
  private _menuOutsideHandler: ((ev: MouseEvent) => void) | null = null

  /**
   * 菜单打开期间挂一个 window 捕获阶段的 mousedown：点**任何**位置（终端 / 别的插件 / 面板空白）都关菜单。
   * ⛔ 不能只靠面板根的 noBubble：点终端或别的插件时本面板根本收不到事件，菜单会一直挂着
   *    （2026-10-28 用户实测：「只有点面板里的其它位置才会消失」）。
   */
  private _armMenuOutsideClose(): void {
    this._disarmMenuOutsideClose()
    this._menuOutsideHandler = (ev: MouseEvent) => {
      if (!this.cmdMenuOpen && !this.titleMenuOpen) { this._disarmMenuOutsideClose(); return }
      const t = ev.target as Element | null
      // 点在菜单自身里：交给菜单项自己处理（这里先关掉会把 click 目标一起撤掉）
      if (t && typeof t.closest === 'function' && t.closest('.qc-cmd-menu, .qc-title-menu')) return
      this.cmdMenuOpen = false
      this.cmdMenuCmd = null
      this.titleMenuOpen = false
      this._disarmMenuOutsideClose()
    }
    window.addEventListener('mousedown', this._menuOutsideHandler, true)
  }

  private _disarmMenuOutsideClose(): void {
    if (this._menuOutsideHandler) {
      window.removeEventListener('mousedown', this._menuOutsideHandler, true)
      this._menuOutsideHandler = null
    }
  }

  /**
   * 右键命令：弹操作菜单（含「拷贝新建命令」）。
   * 「仅悬停显示按钮」模式下没有菜单 ⇒ 保持旧行为：右键直接进编辑。
   */
  onCmdContextMenu(event: MouseEvent, cmd: QuickCommand): void {
    event.preventDefault(); event.stopPropagation()
    this._dbg?.info?.(`cmdContextMenu(bind) name=${JSON.stringify(cmd?.name || '')} mode=${this.actionMode} shift=${event.shiftKey} ctrl=${event.ctrlKey} alt=${event.altKey}`)
    this._openCmdMenu(cmd, event)
  }

  /**
   * 打开命令右键菜单（行内绑定与捕获兜底共用同一出口）。
   * 「仅悬停显示按钮」模式没有菜单 ⇒ 右键退化为直接编辑（保持旧行为）。
   */
  private _openCmdMenu(cmd: QuickCommand, event: MouseEvent): void {
    if (!cmd) return
    if (this.actionMode === 'hover') { this.editCommand(cmd); return }
    // 贴鼠标定位但夹在可视区内：贴在窗口右边/底部时菜单会被裁掉
    const w = 172, h = 268
    const x = Math.min(Math.round(event.clientX), Math.max(8, window.innerWidth - w - 8))
    const y = Math.min(Math.round(event.clientY), Math.max(8, window.innerHeight - h - 8))
    this.cmdMenuCmd = cmd
    this.cmdMenuX = x
    this.cmdMenuY = y
    this.cmdMenuZ = this._panelZ() + 1
    this.cmdMenuOpen = true
    this._armMenuOutsideClose()
  }

  /**
   * 捕获阶段的 contextmenu 兜底（window 级，早于任何 document/元素级监听）。
   * ⛔ 为什么需要：按住修饰键（Shift/Ctrl/Alt）再右键时，行内 Angular `(contextmenu)` 绑定收不到事件
   *    —— 表现就是「按住其它键再右键，菜单不出来」（2026-10-28 用户实测）。
   *    这里按 DOM 上的 data 标记自己找回命令并直接开菜单，开了就 stopImmediatePropagation，
   *    避免和行内绑定重复开两次。只接管「命令行 / 快捷条芯片」，分组头与标题栏仍走各自绑定。
   */
  private _cmdContextCapture = (ev: MouseEvent): void => {
    if (this.destroyed || this.cmdMenuOpen) return
    const host = this.elRef?.nativeElement as HTMLElement | null
    const t = ev.target as HTMLElement | null
    if (!host || !t || !host.contains(t)) return
    const row = t.closest?.('.qc-cmd-row') as HTMLElement | null
    const chip = row ? null : (t.closest?.('.qc-quick-cmd') as HTMLElement | null)
    const el = row || chip
    if (!el) return
    const id = row ? el.getAttribute('data-cmd-id') : el.getAttribute('data-qc-quick-id')
    if (!id) return
    const cmd = this.commands.find(c => c.id === id) || this.pinnedCommands.find(c => c.id === id)
    if (!cmd) return
    this._dbg?.info?.(`cmdContextMenu(capture) name=${JSON.stringify(cmd.name || '')} shift=${ev.shiftKey} ctrl=${ev.ctrlKey} alt=${ev.altKey}`)
    ev.preventDefault()
    ev.stopImmediatePropagation()
    this._openCmdMenu(cmd, ev)
  }

  /** 右键菜单动作分发：菜单里每个条目只调这里，避免各写一套通道 */
  runFromCmdMenu(action: 'run' | 'send' | 'broadcast' | 'edit' | 'duplicate' | 'pin' | 'delete'): void {
    const cmd = this.cmdMenuCmd
    this.closeCmdMenu()
    if (!cmd) return
    switch (action) {
      case 'run': this.executeAlways(cmd); break
      case 'send': this.sendToLine(cmd); break
      case 'broadcast': this.executeOnAllTabs(cmd); break
      case 'edit': this.editCommand(cmd); break
      case 'duplicate': this.duplicateCommand(cmd); break
      case 'pin': this.togglePin(cmd); break
      case 'delete': this.deleteCommand(cmd); break
    }
  }

  /**
   * 拷贝新建命令：以现有命令为原型建一条**新命令**并直接打开编辑弹窗。
   * 用于「拿某条命令改一个变体」——比从空白新建再抄一遍快得多。
   * 不继承：id（新命令）、快捷键（避免与原型冲突）、固定状态（不替用户多钉一条）、执行次数。
   * 继承：步骤/参数占位符/SSH 关联/执行时确认/刷新开关。
   */
  duplicateCommand(cmd: QuickCommand): void {
    const copy: any = JSON.parse(JSON.stringify(cmd))
    delete copy.id
    delete copy.usageCount
    delete copy.lastUsedAt
    copy.name = this.i18n.t('panel.duplicate_copy', { name: cmd.name })
    copy.shortcut = ''
    copy.pinned = false
    this.editCmd = copy
    this.showEditModal = true
    // 与 editCommand 一致：渲染后按内容撑高步骤输入框
    setTimeout(() => {
      document.querySelectorAll('.qc-step-input').forEach(el => this.autoGrowElement(el as HTMLTextAreaElement))
    }, 50)
  }

  /* ---- 标题栏右键菜单：还原默认尺寸 / 默认位置 ---- */
  titleMenuOpen = false
  titleMenuX = 0
  titleMenuY = 0

  onTitlebarContextMenu(event: MouseEvent): void {
    event.preventDefault()
    event.stopPropagation()
    this.titleMenuX = Math.round(event.clientX)
    this.titleMenuY = Math.round(event.clientY)
    this.titleMenuZ = this._panelZ() + 1
    this.titleMenuOpen = true
    this._armMenuOutsideClose()
  }

  /** 面板可用区域（当前拆分 pane 的可视矩形） */
  private _paneRect(): DOMRect | null {
    const el = this.terminalHostEl || (this.terminalRef?.element?.nativeElement as HTMLElement | null)
    const r = el?.getBoundingClientRect()
    return r && r.width > 0 && r.height > 0 ? r : null
  }

  /* ---- 默认位置自适应：窗口/pane 尺寸变化时重新贴边 ---- */
  /** 是否处于「默认位置」：true 时尺寸变化会按新尺寸重算；用户拖过则为 false */
  atDefaultPos = false
  private _resizeRaf: number | null = null
  private _ro: ResizeObserver | null = null

  private _setAtDefaultPos(v: boolean): void {
    this.atDefaultPos = v
    try { localStorage.setItem('qc-plus-panel-at-default', v ? '1' : '0') } catch { /* ignore */ }
  }

  /**
   * 尺寸变化 → **下一帧**立即重排（不设时间窗口，避免「拖窗口时面板慢半拍」的卡顿感）。
   * 用 rAF 合并同一帧内的多次通知，既能跟手又不会重复计算。
   */
  private _scheduleRelayout = (): void => {
    if (this._resizeRaf !== null) return
    this._resizeRaf = requestAnimationFrame(() => {
      this._resizeRaf = null
      this._relayoutNow()
    })
  }

  private _relayoutNow(): void {
    if (this.destroyed) return
    if (this.atDefaultPos) {
      const pos = this.computeDefaultPos()
      this.panelX = pos.x
      this.panelY = pos.y
    }
    // 非默认位置也要保证不跑出 pane；尺寸同样跟着可用空间走
    this.clampToHostPane()
  }

  /**
   * 终端**显示区**矩形（xterm 元素）。
   * ⚠️ `terminalHostEl.getBoundingClientRect().top` 仍包含标签栏/工具栏区域，
   * 直接用它会把面板顶到工具栏上（用户实测：面板盖住「连接选择/端口/SFTP+」那排按钮）。
   * xterm 元素的 top 才是真正的「工具栏下沿」。
   */
  private _terminalContentRect(): DOMRect | null {
    try {
      const host = this.terminalHostEl || (this.terminalRef?.element?.nativeElement as HTMLElement | null)
      const xterm = host?.querySelector?.('.xterm') as HTMLElement | null
      const r = (xterm || host)?.getBoundingClientRect?.()
      return r && r.width > 0 && r.height > 0 ? r : null
    } catch { return null }
  }

  /**
   * 默认位置：
   *   - **横向**：右缘对齐 SFTP+ 面板（未打开时按它的默认几何 2%+96% ⇒ 98% 估算）
   *   - **纵向**：紧贴「终端显示区顶部」（= Tabby 工具栏下沿之下，GAP_TOP），
   *     这样面板不盖工具栏，又比 SFTP+ 面板顶边（`top:3%`，更靠下）高一点点
   * ⚠️ 纵向**不要**用 SFTP+ 的 `top` 反推：它是 `absolute + %`（相对父容器），与 QC+ 的 `fixed + px` 不同基准（踩过两次）。
   * ⚠️ 纵向也**不要**用 hostEl 的 top：它含工具栏。用 `_terminalContentRect()`。
   * ⚠️ 这是唯一实现：装饰器 positionPanelAtDefault() 直接调用本方法，勿再复制公式。
   */
  computeDefaultPos(hostElOverride?: HTMLElement | null): { x: number; y: number } {
    const r = hostElOverride?.getBoundingClientRect?.() || this._paneRect()
    const w = this.panelWidth || 320
    const pad = 4
    /** 相对终端显示区顶部的偏移：负值 = 往上挪。
     *  `.xterm` 元素内部自带 padding，其 rect.top 比「工具栏下沿」低约 18px，
     *  实测面板顶边比期望低 ~20px ⇒ 取 -12 让面板贴住工具栏下沿而不压住它。 */
    const GAP_TOP = -12
    const content = this._terminalContentRect()

    // 横向：优先右缘对齐 SFTP+ 的真实矩形（多实例取最近的），否则按它默认几何估算
    const sftp = this._nearestSftpRect(r)
    const area = content || r
    const x = sftp
      ? Math.round(Math.max(pad, sftp.right - w))
      : area
        ? Math.round(Math.max(area.left + pad, area.left + area.width * 0.98 - w))
        : 20

    // 纵向：贴终端显示区顶部（工具栏下沿 + 6px），不盖工具栏
    const y = area ? Math.round(Math.max(pad, area.top + GAP_TOP)) : 60
    this._dbg?.info?.(`defaultPos host=${r ? Math.round(r.top) + ',' + Math.round(r.left) : '-'} content=${content ? Math.round(content.top) + ',' + Math.round(content.left) : '-'} -> x=${x} y=${y}`)
    return { x, y }
  }

  /** 找离当前 pane 最近的、正显示的 SFTP+ 面板矩形（每个 SSH 标签可能各有一个实例） */
  private _nearestSftpRect(paneRect: DOMRect | null): DOMRect | null {
    try {
      const els = Array.from(document.querySelectorAll('sftp-plus-panel')) as HTMLElement[]
      let best: DOMRect | null = null
      let bestDist = Infinity
      for (const el of els) {
        const rr = el.getBoundingClientRect()
        if (rr.width <= 0 || rr.height <= 0) continue
        if (!paneRect) return rr
        const dx = (rr.left + rr.width / 2) - (paneRect.left + paneRect.width / 2)
        const dy = (rr.top + rr.height / 2) - (paneRect.top + paneRect.height / 2)
        const d = dx * dx + dy * dy
        if (d < bestDist) { bestDist = d; best = rr }
      }
      return best
    } catch { return null }
  }

  /** 还原默认大小：宽 320、高度自适应（与首次打开一致） */
  resetPanelSize(): void {
    this.titleMenuOpen = false
    this._storedWidth = 320
    this._storedHeight = 0
    try {
      localStorage.setItem('qc-plus-panel-width', '320')
      localStorage.setItem('qc-plus-panel-height', '0')
    } catch { /* ignore */ }
    this.clampToHostPane()
  }

  /** 还原默认位置：右缘与 SFTP+ 对齐、顶边比它高出一个标题栏 */
  resetPanelPosition(): void {
    this.titleMenuOpen = false
    // 标记为「默认位置」：之后窗口/拆分尺寸变化都会跟着重新贴边
    this._setAtDefaultPos(true)
    const pos = this.computeDefaultPos()
    this.panelX = pos.x
    this.panelY = pos.y
    // 写入位置记忆，否则下次打开会被旧记忆覆盖
    try { this.svc.savePanelPosition({ x: pos.x, y: pos.y }) } catch { /* ignore */ }
    this.clampToHostPane()
  }

  /** 快捷入口芯片上的 ✕：取消固定（复用 togglePin 的顺序同步逻辑，移除后不再出现在快捷条） */
  unpinQuick(cmd: QuickCommand): void {
    if (cmd.pinned) this.togglePin(cmd)
  }

  /* ---- 列表滚动吸附：停止后把顶端对齐到「整行」边界，避免条目被裁成半行 ---- */
  private _snapTimer: any = null

  onListScroll(): void {
    // 吸附是可选功能（设置页「滚动吸附到整行」，默认关闭）：关闭时完全不干预滚动
    if (!this.scrollSnapEnabled) return
    // 用 debounce 等惯性滚动停下来再吸附（等价于 DOM scroll-snap 的体验，但可控性更好）
    if (this._snapTimer) clearTimeout(this._snapTimer)
    this._snapTimer = setTimeout(() => this._snapListScroll(), 120)
  }

  /**
   * 把列表的 scrollTop 对齐到最近的行 / 分组头边界：
   * 顶部永远是完整一行（切到下一行时旧行整体滚出），底部因此最多空出一段留白，
   * 而不是露出半行 UI。滚到最底部时改为底部对齐（保证最后一行完整可见）。
   */
  private _snapListScroll(): void {
    const list = this.listRef?.nativeElement as HTMLElement | null
    if (!list) return
    const items = Array.from(
      list.querySelectorAll<HTMLElement>('.qc-group-header, .qc-cmd-row')
    )
    if (items.length === 0) return
    const scrollTop = list.scrollTop
    const listTop = list.getBoundingClientRect().top
    const bounds = new Set<number>()
    for (const el of items) {
      // 元素相对「列表内容顶部」的偏移（children 可能滚动出视口，故用 rect 反推）
      const off = Math.round(el.getBoundingClientRect().top - listTop + scrollTop)
      if (off > 0) bounds.add(off)
    }
    const sorted = Array.from(bounds).sort((a, b) => a - b)
    const maxScroll = list.scrollHeight - list.clientHeight
    if (maxScroll <= 0) return
    // 取 ≤ scrollTop 的最大边界（顶部对齐）；滚动到底附近则退化为底部对齐
    let target = 0
    for (const b of sorted) { if (b <= scrollTop + 1) target = b; else break }
    if (target > 0 && Math.abs(scrollTop - maxScroll) <= 2) target = maxScroll
    if (Math.abs(target - scrollTop) > 1) list.scrollTop = target
  }

  /* ---- 快捷入口（书签）拖拽排序：只改书签自身顺序，不影响命令列表 ---- */
  quickDragId: string | null = null
  quickDropId: string | null = null
  quickDropSide: 'left' | 'right' = 'right'

  onQuickDragStart(event: DragEvent, cmd: QuickCommand): void {
    this.quickDragId = cmd.id
    event.dataTransfer?.setData('text/plain', 'quick:' + cmd.id)
    if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'
    // 与列表拖拽同样的兜底：drop 后重排可能让源元素被销毁，绑在它上面的 dragend 会丢
    document.addEventListener('dragend', this._onAnyQuickDragEnd, { once: true })
  }

  onQuickDragOver(event: DragEvent): void {
    // 只接管「由快捷条自身发起」的拖拽：列表条目拖到快捷条上方时不接管（不 preventDefault，
    // 因而不会成为 drop 目标），避免把列表拖拽误判成书签排序
    if (this.quickDragId === null) return
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'move'
    const el = event.currentTarget as HTMLElement
    this.quickDropId = el.getAttribute('data-qc-quick-id')
    const rect = el.getBoundingClientRect()
    this.quickDropSide = (event.clientX - rect.left) > rect.width / 2 ? 'right' : 'left'
  }

  onQuickDragLeave(event: DragEvent): void {
    const el = event.currentTarget as HTMLElement
    if (this.quickDropId === el.getAttribute('data-qc-quick-id')) {
      this.quickDropId = null
      this.quickDropSide = 'right'
    }
  }

  onQuickDrop(event: DragEvent, target: QuickCommand): void {
    if (this.quickDragId === null) return
    event.preventDefault(); event.stopPropagation()
    const raw = event.dataTransfer?.getData('text/plain') || ''
    const srcId = this.quickDragId || raw.replace(/^quick:/, '')
    const el = event.currentTarget as HTMLElement
    const dropAfter = (event.clientX - el.getBoundingClientRect().left) > el.offsetWidth / 2
    this._clearQuickDragState()
    if (!srcId || srcId === target.id) return
    const ids = this.svc.getPinned().map(c => c.id)
    const from = ids.indexOf(srcId)
    const to = ids.indexOf(target.id)
    if (from === -1 || to === -1) return
    ids.splice(from, 1)
    // 目标位于源之后时，移除源元素会让目标索引前移 1，故按方向补偿
    const insertAt = from < to ? (dropAfter ? to : to - 1) : (dropAfter ? to + 1 : to)
    ids.splice(Math.max(0, Math.min(insertAt, ids.length)), 0, srcId)
    this.svc.reorderPinned(ids)
    this.pinnedCommands = this.svc.getPinned()
  }

  onQuickDragEnd(): void { this._clearQuickDragState() }

  /** document 级 dragend 兜底（由 onQuickDragStart 以 once 挂载） */
  private _onAnyQuickDragEnd = (): void => { this._clearQuickDragState() }

  private _clearQuickDragState(): void {
    this.quickDragId = null
    this.quickDropId = null
    this.quickDropSide = 'right'
  }

  onListDrop(event: DragEvent, groupName: string): void {
    event.preventDefault()
    console.log('[QC+] onListDrop group=' + groupName + ' srcId=' + (this.dragCmdId || '-'))
    this.listDropOver = false
    this.cleanDragStyles()
    const srcId = this.dragCmdId || event.dataTransfer?.getData('text/plain')
    if (!srcId) return
    const srcCmd = this.commands.find(c => c.id === srcId)
    if (!srcCmd) return
    if ((srcCmd.group || '') !== (groupName || '')) {
      this.svc.update(srcCmd.id, { group: groupName || '' })
      srcCmd.group = groupName || ''
    }
    const allIds = this.commands.map(c => c.id)
    const idx = allIds.indexOf(srcId)
    if (idx !== -1) allIds.splice(idx, 1)
    allIds.push(srcId)
    this.svc.reorder(allIds)
    this.commands = this.svc.getAll()
    this.groups = this.svc.getGroups()
    this.onSearch()
  }

  /**
   * 清除拖拽期间残留的指示类（行插入线 / 半透明源行 / 组头线 / 步骤行线 / 末尾插入条）。
   * ⚠ 查询范围必须是**面板自身容器**：QC+ 面板挂在 document.body 下的 panelHost 里，
   *   并不在 terminalRef 元素子树内 —— 早先用 terminalRef 当 scope 时 querySelectorAll 恒为空，
   *   行上的 drag-over 永远清不掉，松手后行顶部就残留一条 3px 主色线（用户反馈的“border”）。
   */
  private _clearDragClasses(): void {
    try {
      const own = (this.listRef?.nativeElement as HTMLElement | null)?.closest('.qc-panel') as HTMLElement | null
      const root: ParentNode = own || document
      root.querySelectorAll(
        '.qc-cmd-row.dragging, .qc-cmd-row.drag-over, .qc-cmd-row.drag-over-bottom,' +
        ' .qc-group-header.drag-over, .qc-group-header.drag-over-bottom,' +
        ' .qc-step-row.drag-over, .qc-step-row.drag-over-bottom,' +
        ' .qc-drop-end.drag-over'
      ).forEach(el => el.classList.remove('dragging', 'drag-over', 'drag-over-bottom'))
    } catch { /* ignore */ }
  }

  private cleanDragStyles(): void {
    this._clearDragClasses()
    // 兜底：确保列表的 is-dragging 类被移除
    if (this.listRef?.nativeElement) {
      this.listRef.nativeElement.classList.remove('is-dragging')
    }
  }

  showGroupRenameDialog(oldName: string): void {
    this.loadAvailableProfiles()
    this.groupRenameIsNew = false; this.groupRenameOldName = oldName; this.groupRenameValue = oldName
    const g = this.svc.getGroups().find(gr => gr.name === oldName)
    this.groupRenameOrder = g?.order ?? 0
    this.groupRenameProfileIds = g?.profileIds ? [...g.profileIds] : []
    this.showGroupRename = true
  }

  toggleGroupProfile(profileId: string, checked: boolean): void {
    if (checked) {
      if (!this.groupRenameProfileIds.includes(profileId)) this.groupRenameProfileIds.push(profileId)
    } else {
      this.groupRenameProfileIds = this.groupRenameProfileIds.filter(id => id !== profileId)
    }
  }

  toggleAllProfiles(selectAll: boolean): void {
    if (selectAll) {
      this.groupRenameProfileIds = this.availableProfiles.map(p => p.id)
    } else {
      this.groupRenameProfileIds = []
    }
  }

  deleteGroup(name: string): void {
    if (!name) return
    // #14 修复：使用自定义确认弹窗替代原生 confirm()
    this.confirmModalTitle = this.i18n.t('group.delete_confirm', { name })
    // 清掉上一条命令的预览，避免删除分组时还残留命令内容
    this.confirmModalDetail = ''
    this._confirmCallback = () => {
      this.svc.removeGroup(name)
      this.loadData()
    }
    this.showConfirmModal = true
  }

  deleteCommand(cmd: QuickCommand): void {
    // #14 修复：使用自定义确认弹窗替代原生 confirm()
    this.confirmModalTitle = this.i18n.t('panel.delete_confirm', { name: cmd.name })
    // 一并显示这条命令到底会执行什么（多步骤按启用顺序拼成多行），避免只看名字误删
    this.confirmModalDetail = (cmd.steps && cmd.steps.length > 0)
      ? cmd.steps.filter(s => s.enabled !== false).map(s => s.text).filter(Boolean).join('\n')
      : (cmd.text || '')
    this._confirmCallback = () => {
      this.svc.remove(cmd.id)
      this.loadData()
    }
    this.showConfirmModal = true
  }

  /* ---- 命令执行记录 ---- */
  showHistory = false
  execHistory: QcExecRecord[] = []
  /** 筛选：连接标识（'' = 全部） */
  historyTarget = ''
  /** 筛选：时间范围（datetime-local 字符串，空 = 不限） */
  historyFrom = ''
  historyTo = ''

  /** 记录里出现过的连接（用于筛选下拉） */
  get historyTargets(): string[] {
    const set = new Set<string>()
    for (const r of this.execHistory) if (r.target) set.add(r.target)
    return Array.from(set)
  }

  /** 时间筛选预设档：'' 全部 / today / 7d / 30d / custom（custom 才用起止日期框） */
  historyRange = ''

  /** 应用「连接 + 时间」筛选后的记录 */
  get filteredHistory(): QcExecRecord[] {
    let from: number | null = null
    let to: number | null = null
    if (this.historyRange === 'today') {
      const d = new Date(); d.setHours(0, 0, 0, 0); from = d.getTime()
    } else if (this.historyRange === '7d') {
      from = Date.now() - 7 * 86400000
    } else if (this.historyRange === '30d') {
      from = Date.now() - 30 * 86400000
    } else if (this.historyRange === 'custom') {
      from = this.historyFrom ? new Date(this.historyFrom).getTime() : null
      to = this.historyTo ? new Date(this.historyTo).getTime() : null
    }
    return this.execHistory.filter(r => {
      if (this.historyTarget && r.target !== this.historyTarget) return false
      if (from !== null && !Number.isNaN(from) && r.ts < from) return false
      if (to !== null && !Number.isNaN(to) && r.ts > to) return false
      return true
    })
  }

  /**
   * 导出当前筛选出的执行记录（CSV）。
   * ① 命令文本常含逗号/引号/换行 ⇒ 必须做 CSV 转义（含引号时整体加引号且内部引号翻倍）
   * ② 加 UTF-8 BOM ⇒ Excel 直接打开不会中文乱码
   * ③ 换行用 CRLF，兼容 Excel
   */
  exportHistory(): void {
    try {
      const esc = (v: string): string => {
        const s = String(v ?? '')
        return /[",\n\r]/.test(s) ? '"' + s.split('"').join('""') + '"' : s
      }
      const header = ['Time', 'Mode', 'Target', 'Name', 'Text'].join(',')
      const rows = this.filteredHistory.map(r => [
        this.formatRecordTime(r.ts), r.mode, r.target, r.name, r.text,
      ].map(esc).join(','))
      const blob = new Blob(['\uFEFF' + [header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      const d = new Date()
      const p = (n: number) => String(n).padStart(2, '0')
      a.href = url
      a.download = `qc-exec-history-${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch { /* ignore */ }
  }

  openHistory(): void {
    this.execHistory = this.svc.getExecRecords()
    // 每次打开重置筛选，避免上次条件残留导致误以为没记录
    this.historyTarget = ''
    this.historyRange = ''
    this.historyFrom = ''
    this.historyTo = ''
    this.historyMenu = ''
    this.showHistory = true
    // 必须把焦点送进弹窗：焦点留在面板根时，Esc 会被面板级「弹窗打开则忽略按键」的守卫吞掉
    // （现已改为代发，但焦点进弹窗仍是最稳的路径；多级重试见 _focusModal）
    this._focusModal('.qc-history-modal')
  }

  closeHistory(): void {
    this.historyMenu = ''
    this.showHistory = false
    this.focusPanel()
  }

  /* ---- 弹窗内自绘下拉（原生 <select> 在面板浮层里点不开选项，见 .qc-dd 注释） ---- */

  /** 执行记录：当前展开的筛选下拉（'' = 都收起） */
  historyMenu: '' | 'target' | 'range' = ''

  /** 编辑命令弹窗：分组下拉是否展开 */
  editGroupMenuOpen = false

  /** 时间筛选的当前档位文案（自绘下拉需要显式回显，原生 select 会自动显示选中项） */
  get historyRangeLabel(): string {
    const map: Record<string, string> = {
      '': 'panel.history_time_all',
      today: 'panel.history_today',
      '7d': 'panel.history_7d',
      '30d': 'panel.history_30d',
      custom: 'panel.history_custom',
    }
    return this.i18n.t(map[this.historyRange] || 'panel.history_time_all')
  }

  /** 空列表文案：有筛选条件时说「没有符合条件」，否则（如刚清空）说「暂无记录」 */
  get historyEmptyText(): string {
    const filtered = !!(this.historyTarget || this.historyRange)
    return this.i18n.t(filtered ? 'panel.history_empty_filtered' : 'panel.history_empty')
  }

  toggleHistoryMenu(which: 'target' | 'range', event: Event): void {
    event.stopPropagation()
    this.historyMenu = this.historyMenu === which ? '' : which
  }

  chooseHistoryTarget(v: string): void {
    this.historyTarget = v
    this.historyMenu = ''
  }

  chooseHistoryRange(v: string): void {
    this.historyRange = v
    this.historyMenu = ''
  }

  toggleEditGroupMenu(event: Event): void {
    event.stopPropagation()
    this.editGroupMenuOpen = !this.editGroupMenuOpen
  }

  chooseEditGroup(name: string): void {
    this.editCmd.group = name
    this.editGroupMenuOpen = false
  }

  /**
   * 弹窗空白处收起内嵌下拉。
   * 触发器与选项都在 .qc-dd 内（各自由 click 处理开合与选中），所以这里只负责"点了别处"。
   */
  onModalMousedown(event: MouseEvent): void {
    if (!this.historyMenu && !this.editGroupMenuOpen) return
    const t = event.target as HTMLElement | null
    try { if (t?.closest?.('.qc-dd')) return } catch { /* ignore */ }
    this.historyMenu = ''
    this.editGroupMenuOpen = false
  }

  /** Esc：先收起展开的下拉，再关弹窗（否则一次 Esc 直接把整个面板关掉，用户还得重开） */
  closeHistoryOrMenu(): void {
    if (this.historyMenu) { this.historyMenu = ''; return }
    this.closeHistory()
  }

  /** 清空执行记录（用 Tabby 原生 confirm 弹窗 —— 与 SFTP+ 清除传输记录同款，无层级问题） */
  clearHistory(): void {
    // ⛔ 面板内禁用原生 confirm()/alert()（Electron 焦点链不交还 ⇒ 之后表单控件点不动），
    //    统一走面板内自绘确认框（与删除命令/分组、SFTP+ 的确认框一致）。
    this.confirmModalTitle = this.i18n.t('panel.history_clear_confirm')
    this.confirmModalDetail = ''
    this._confirmCallback = () => {
      this.svc.clearExecRecords()
      this.execHistory = []
    }
    this.showConfirmModal = true
  }

  /** 记录时间显示（24 小时制，含年份，跨年也能分辨） */
  formatRecordTime(ts: number): string {
    try {
      const d = new Date(ts)
      const p = (n: number) => String(n).padStart(2, '0')
      return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`
    } catch { return '' }
  }

  /**
   * 记录里的命令文本：多行命令的换行用 ⏎ 显式标出（与面板列表 getPreview 同款写法）。
   * ⚠️ 详情列是单行 + 省略号（为了让 4 列对齐），不标出换行的话
   *    「clear\nsystemctl status x」会被渲染成「clear systemctl status x」，
   *    看起来像命令少了一半——用户以为执行记录存错了。
   */
  formatRecordText(text: string): string {
    return String(text || '').replace(/\r?\n/g, ' \u21B5 ')
  }

  /**
   * 执行记录里保存的「连接标识」，优先做成 **账号@地址**（可读），
   * 取不到再退回 profileId —— profile.id 常常是 `ssh:custom:Aliyun:<uuid>` 这种长串，读起来很糟。
   */
  /**
   * 给**任意标签页**算连接标识（与 _recordTarget 同口径：账号@地址 → 只有地址 → profileId → 标签标题）。
   * 广播记录要列出"具体发到了哪些连接"，只能逐个标签算，不能复用当前终端那一个。
   */
  private _targetOfTab(t: any): string {
    try {
      const ssh: any = t?.sshSession || t?._session || t?.session || null
      const profile: any = ssh?.profile || t?.profile || null
      const user = ssh?.user || profile?.options?.user || ''
      const host = ssh?.host || profile?.options?.host || ''
      if (user && host) return `${user}@${host}`
      if (host) return String(host)
      if (profile?.id) return String(profile.id)
      return String(t?.title || '')
    } catch { return String((t && t.title) || '') }
  }

  private _recordTarget(): string {
    try {
      const t: any = this.terminalRef
      const ssh: any = t?.sshSession || t?._session || null
      const user = ssh?.user || t?.profile?.options?.user || ''
      const host = ssh?.host || t?.profile?.options?.host || ''
      if (user && host) return `${user}@${host}`
      if (host) return String(host)
    } catch { /* ignore */ }
    return this._activeProfileId()
  }

  /* ---- #14 自定义确认弹窗 ---- */
  showConfirmModal = false
  confirmModalTitle = ''
  /** 确认框补充内容（删除命令时为命令文本）；空则不显示该块 */
  confirmModalDetail = ''
  private _confirmCallback: (() => void) | null = null

  doConfirmModal(): void {
    this.showConfirmModal = false
    this.focusPanel()
    if (this._confirmCallback) {
      this._confirmCallback()
      this._confirmCallback = null
    }
  }

  cancelConfirmModal(): void {
    this.showConfirmModal = false
    this._confirmCallback = null
    this.focusPanel()
  }

  confirmGroupRename(): void {
    const newName = this.groupRenameValue?.trim()
    if (this.groupRenameIsNew) {
      if (newName) {
        this.svc.addGroup(newName, this.groupRenameOrder)
        this.svc.updateGroupProfiles(newName, this.groupRenameProfileIds)
      }
    } else {
      if (!newName || newName === this.groupRenameOldName) {
        // 名称没变，更新排序和 profileIds
        this.svc.updateGroupOrder(this.groupRenameOldName, this.groupRenameOrder)
        this.svc.updateGroupProfiles(this.groupRenameOldName, this.groupRenameProfileIds)
        this.closeGroupRename(); this.loadData(); return
      }
      this.svc.renameGroup(this.groupRenameOldName, newName)
      this.svc.updateGroupOrder(newName, this.groupRenameOrder)
      this.svc.updateGroupProfiles(newName, this.groupRenameProfileIds)
    }
    this.closeGroupRename(); this.loadData()
  }

  closeGroupRename(): void { this.showGroupRename = false; this.groupRenameIsNew = false; this.groupRenameOldName = ''; this.groupRenameValue = ''; this.groupRenameOrder = 0; this.groupRenameProfileIds = []; this.availableProfiles = []; this.focusPanel() }

  addNewGroup(): void { this.loadAvailableProfiles(); this.groupRenameIsNew = true; this.groupRenameOldName = ''; this.groupRenameValue = ''; this.groupRenameOrder = 0; this.groupRenameProfileIds = []; this.showGroupRename = true }

  startDrag(event: MouseEvent): void {
    if (event.button !== 0) return
    // ★ 防误拖（对齐 SFTP+ 的 4px 阈值）：按下后移动不足 4px 视为点击，不移动面板
    const startX = event.clientX
    const startY = event.clientY
    this.dragging = false
    this.dragOffsetX = event.clientX - this.panelX
    this.dragOffsetY = event.clientY - this.panelY
    const hostEl = (this.terminalHostEl || this.terminalRef?.element?.nativeElement) as HTMLElement | null
    this.dragMoveHandler = (ev: MouseEvent) => {
      if (!this.dragging) {
        if (Math.abs(ev.clientX - startX) < 4 && Math.abs(ev.clientY - startY) < 4) return
        this.dragging = true
        // 用户真正拖动过面板 ⇒ 不再跟随「默认位置」自适应（只在阈值通过时写一次）
        if (this.atDefaultPos) this._setAtDefaultPos(false)
      }
      let x = ev.clientX - this.dragOffsetX
      let y = ev.clientY - this.dragOffsetY
      if (hostEl) {
        // 面板是 body + position:fixed（panelX/panelY 为视口坐标），因此必须以「所属 pane 的
        // 视口矩形」为界。旧实现用 hostEl.clientWidth/clientHeight（pane 内尺寸）并把坐标 clamp 到
        // [0, …]：拆分时 pane 带 left/top 偏移，等于允许把面板拖到视口左上角（隔壁 pane 区域），
        // 表现为「一拖拽就跳出拆分窗口」。改为 r.left/r.top + pad 起算，与 resize / 打开裁剪同一口径。
        // ⚠️ 全局布局：hostEl 是「打开面板时的那个标签」，切到别的标签后它已在后台、rect 会变成 0×0，
        //    用它当边界会把面板夹到 (4,4) —— 表现为「一拖就消失」。全局模式改用视口边界。
        const isGlobal = this.svc.getLayoutMode() === 'global'
        const r: any = isGlobal
          ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight }
          : hostEl.getBoundingClientRect()
        const panelEl = hostEl.querySelector('.qc-panel') as HTMLElement | null
        const pw = panelEl?.offsetWidth || this.panelWidth || 320
        const ph = panelEl?.offsetHeight || this.panelHeight || 200
        const pad = 4
        const maxX = Math.max(r.left + pad, r.right - pw - pad)
        const maxY = Math.max(r.top + pad, r.bottom - ph - pad)
        x = Math.max(r.left + pad, Math.min(x, maxX))
        y = Math.max(r.top + pad, Math.min(y, maxY))
      }
      this.panelX = x; this.panelY = y
    }
    this.dragUpHandler = () => {
      this.dragging = false
      // 位置全局统一：保存并同步到所有已打开的面板
      this._saveCurrentPosToGlobal()
      this.cleanDrag()
    }
    document.addEventListener('mousemove', this.dragMoveHandler)
    document.addEventListener('mouseup', this.dragUpHandler)
  }

  private cleanDrag(): void {
    if (this.dragMoveHandler) { document.removeEventListener('mousemove', this.dragMoveHandler); this.dragMoveHandler = null }
    if (this.dragUpHandler) { document.removeEventListener('mouseup', this.dragUpHandler); this.dragUpHandler = null }
  }

  /* ---- 面板大小调整 ---- */
  startResize(event: MouseEvent, dir: string): void {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const panelEl = (event.currentTarget as HTMLElement).closest('.qc-panel') as HTMLElement
    const startH = this.panelHeight || panelEl?.offsetHeight || 420
    this.resizing = { dir, startW: this.panelWidth, startH, lastX: event.clientX, lastY: event.clientY }
    this.resizeMoveHandler = (ev: MouseEvent) => {
      if (!this.resizing) return
      const dx = ev.clientX - this.resizing.lastX
      const dy = ev.clientY - this.resizing.lastY
      this.resizing.lastX = ev.clientX
      this.resizing.lastY = ev.clientY
      const dir = this.resizing.dir
      // 容器边界约束：以「所属 pane 的可视矩形」为基准。面板是 body+fixed，panelX/panelY 是
      // 视口坐标，旧实现拿 clientWidth 与视口坐标混算，拆分窗口下边界会算错。
      const hostEl = this.terminalHostEl || (this.terminalRef?.element?.nativeElement as HTMLElement | null)
      const paneR = hostEl?.getBoundingClientRect()
      const paneW = paneR?.width ?? 9999
      const paneH = paneR?.height ?? 9999
      const pad = 4
      const relX = paneR ? this.panelX - paneR.left : 0
      const relY = paneR ? this.panelY - paneR.top : 0
      // 尺寸下限随 pane 收缩；高度下限放宽到 200（搜索栏 + 两行命令 + footer 仍可用），
      // 便于「矮而宽」的贴角摆放
      const minW = Math.max(160, Math.min(280, paneW - pad * 2))
      const minH = Math.max(140, Math.min(200, paneH - pad * 2))
      let newW = this.panelWidth
      let newH = this.panelHeight || this.resizing.startH
      // E/SE/NE：右边缘不超出 pane
      if (dir.includes('e')) { const limit = paneW - relX - pad; newW = Math.max(minW, Math.min(newW + dx, limit)) }
      // W/NW/SW：左边缘不超出 pane 左边界
      // ⚠ leftLimit 只应限制「向左扩展」（dw 为负）那一侧，不能限制「向右收缩」——
      //    早先写成 Math.min(dx, maxShrink, leftLimit)，面板贴 pane 左沿（relX=0）时 dy/dx 被压成 0，
      //    导致宽度/高度完全锁死（表现为拖左上/右上角只能调宽度、调不了高度）。
      if (dir.includes('w')) {
        const maxShrink = newW - minW   // 向右最多收缩量（dw 正向上限）
        const leftLimit = relX          // 向左最多扩展量（dw 负向下限）
        const dw = Math.max(Math.min(dx, maxShrink), -leftLimit)
        newW -= dw; this.panelX += dw
      }
      // S/SW/SE：下边缘不超出 pane
      if (dir.includes('s')) { const limit = paneH - relY - pad; newH = Math.max(minH, Math.min(newH + dy, limit)) }
      // N/NE/NW：上边缘不超出 pane 上边界（topLimit 同上，只限制向上扩展）
      if (dir.includes('n')) {
        const maxShrink = newH - minH   // 向下最多收缩量（dh 正向上限）
        const topLimit = relY           // 向上最多扩展量（dh 负向下限）
        const dh = Math.max(Math.min(dy, maxShrink), -topLimit)
        newH -= dh; this.panelY += dh
      }
      this.panelWidth = Math.round(newW)
      this.panelHeight = Math.round(newH)
      this._applyColumns()
    }
    this.resizeUpHandler = () => {
      // 记录「用户意图尺寸」供切换 pane 后重新裁剪，并持久化
      this._storedWidth = this.panelWidth
      this._storedHeight = this.panelHeight || 0
      // #10 修复：try-catch 防止 QuotaExceededError
      try {
        localStorage.setItem('qc-plus-panel-width', String(this._storedWidth))
        localStorage.setItem('qc-plus-panel-height', String(this._storedHeight))
      } catch (e) { console.warn('[QC+] resize localStorage failed', e) }
      this.resizing = null
      this.cleanResize()
    }
    document.addEventListener('mousemove', this.resizeMoveHandler)
    document.addEventListener('mouseup', this.resizeUpHandler)
  }

  private cleanResize(): void {
    if (this.resizeMoveHandler) { document.removeEventListener('mousemove', this.resizeMoveHandler); this.resizeMoveHandler = null }
    if (this.resizeUpHandler) { document.removeEventListener('mouseup', this.resizeUpHandler); this.resizeUpHandler = null }
  }

  private restorePosition(): void {
    const hostEl = this.terminalHostEl || (this.terminalRef?.element?.nativeElement as HTMLElement | null)

    // 默认先使用「贴近入口」的坐标（装饰器在 togglePanel 阶段已算好 panelX/panelY）
    // 仅当「保存位置」在当前 hostEl 的可视范围内时才采纳并覆盖——确保 split 场景
    // 下从任意 pane 打开都能贴在当前 pane 入口旁，不会跑到另一个 pane 的屏坐标。
    const saved = this._readPosFromSaved()
    if (hostEl && this._isPosInsideHost(saved.x, saved.y, hostEl)) {
      this.panelX = Math.max(0, saved.x); this.panelY = Math.max(0, saved.y)
    }
    // 否则保留 togglePanel 阶段 positionPanelAtDefault 已算好的默认坐标

    // 边界约束：打开即把尺寸+位置裁剪进当前 pane（拆分窄窗下不溢出，对齐 SFTP+）
    setTimeout(() => this.clampToHostPane(hostEl), 0)
  }

  /**
   * 把面板几何（尺寸 + 位置）约束到所属 pane 内 —— 拆分窗口自适应，对齐 SFTP+ 的做法。
   * 只更新渲染值（panelWidth/panelHeight/autoMaxHeight/panelX/panelY），**不写回存储**：
   * 存储保留用户意图尺寸（_stored*），这样换个更宽的 pane 打开时能恢复原尺寸，
   * 而不是像「把窄 pane 压缩值写回全局」那样越开越小（SFTP+ 已踩过的串味坑）。
   * 调用时机：打开/恢复面板、拆分比例或窗口尺寸变化时。
   */
  clampToHostPane(hostEl?: HTMLElement | null): void {
    const el = hostEl || this.terminalHostEl || (this.terminalRef?.element?.nativeElement as HTMLElement | null)
    // 全局布局：面板不受「打开它的那个 pane」约束（切标签后该 pane 可能已在后台、rect 为 0），
    // 统一以窗口视口为可用区域，否则面板会被压到 0 尺寸或夹到左上角。
    const isGlobal = this.svc.getLayoutMode() === 'global'
    if (!isGlobal && !el) return
    const r: any = isGlobal
      ? { left: 0, top: 0, right: window.innerWidth, bottom: window.innerHeight, width: window.innerWidth, height: window.innerHeight }
      : (el as HTMLElement).getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return
    const pad = 4
    // pane 可用空间（pane 比面板下限还窄时退化为 pane 尺寸，不再强撑最小值）
    const availW = Math.max(160, r.width - pad * 2)
    const availH = Math.max(120, r.height - pad * 2)
    this.panelWidth = Math.round(Math.min(this._storedWidth || 320, availW))
    this.panelHeight = this._storedHeight ? Math.round(Math.min(this._storedHeight, availH)) : 0
    this.autoMaxHeight = Math.round(Math.min(420, availH))
    // 位置：完全落回 pane 矩形内
    const pw = this.panelWidth || 320
    const ph = this.panelHeight || this.autoMaxHeight
    this.panelX = Math.round(Math.max(r.left + pad, Math.min(this.panelX, Math.max(r.left + pad, r.right - pw - pad))))
    this.panelY = Math.round(Math.max(r.top + pad, Math.min(this.panelY, Math.max(r.top + pad, r.bottom - ph - pad))))
    this._applyColumns()
  }

  /** 列表列模式：'1' = 单列；'multi' = 由 CSS grid auto-fill 自适应列数 */
  _cols: '1' | 'multi' = '1'

  /**
   * 按当前宽度决定列表是否进入多列模式。列数不再按固定阈值分 2/3 档，
   * 而是交给 CSS `grid-template-columns: repeat(auto-fill, minmax(240px, 1fr))` 自适应 ——
   * 面板越宽列数越多，横向空间用得更满。
   * 不用 column-count：固定高度的滚动容器里多列会向右侧溢出而不是纵向滚动。
   */
  private _applyColumns(): void {
    const next: '1' | 'multi' = (this.panelWidth || 320) >= 500 ? 'multi' : '1'
    if (next !== this._cols) this._cols = next
  }

  /** 判断绝对坐标 (x, y) 是否落在 hostEl 的可视矩形内（包含宽度/高度容差） */
  private _isPosInsideHost(x: number, y: number, hostEl: HTMLElement): boolean {
    const r = hostEl.getBoundingClientRect()
    if (r.width <= 0 || r.height <= 0) return false
    const panelW = this.panelWidth || 320
    const panelH = this.panelHeight || 200
    return (
      x >= r.left - 4 &&
      x + panelW <= r.right + 4 &&
      y >= r.top - 4 &&
      y + panelH <= r.bottom + 4
    )
  }

  /** 关闭/销毁时持久化当前面板位置（全局统一） */
  private savePosMemory(): void {
    this.svc.savePanelPosition({ x: this.panelX, y: this.panelY })
  }

  /**
   * 拖拽结束时持久化位置（全局统一：之后打开的面板套用同一份坐标）。
   * 刻意**不**向其它已打开的面板广播 —— 早先会派发 qc-plus-global-pos-changed 让所有面板实时跟随，
   * 导致拆分窗口里同时开着多份面板时，拖任意一个都会把其余面板一起挪走（非用户预期）。
   * 位置统一只应在「打开时」生效，各面板运行期间位置相互独立。
   */
  private _saveCurrentPosToGlobal(): void {
    this.svc.savePanelPosition({ x: this.panelX, y: this.panelY })
  }

  private _readPosFromSaved(): { x: number; y: number } {
    const saved = this.svc.getPanelPosition()
    return { x: saved.x, y: saved.y }
  }

  doClose(): void {
    if (!this.profileId) this.initTerminalInfo()
    this.savePosMemory()
    if (this.onClose) this.onClose()
  }

  /** 面板根：阻止鼠标事件冒泡到终端；顺带收起展开中的浮层（分组下拉、标题栏右键菜单） */
  noBubble(event: MouseEvent): void {
    if (this.filterMenuOpen) this.filterMenuOpen = false
    if (this.titleMenuOpen) { this.titleMenuOpen = false; this._disarmMenuOutsideClose() }
    if (this.cmdMenuOpen) this.closeCmdMenu()
    event.stopPropagation()
  }
}