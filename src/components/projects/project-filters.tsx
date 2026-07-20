"use client";

import { Search } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { SORT_LABEL, STATUS_LABEL, VIDEO_FORMAT_LABEL } from "@/lib/project-labels";
import type { ProjectStatus, SerializedChannel, VideoFormat } from "@/types/project";
import type { ProjectSort } from "@/server/services/project.service";

const ALL = "ALL";

export type ProjectFiltersValue = {
  q: string;
  channel: string;
  status: string;
  format: string;
  sort: ProjectSort;
};

export function ProjectFilters({
  value,
  channels,
  onChange,
}: {
  value: ProjectFiltersValue;
  channels: SerializedChannel[];
  onChange: (next: Partial<ProjectFiltersValue>) => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-col gap-3 sm:flex-row">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="프로젝트 검색..."
            value={value.q}
            onChange={(e) => onChange({ q: e.target.value })}
          />
        </div>

        <Select value={value.channel} onValueChange={(v) => onChange({ channel: v })}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>모든 채널</SelectItem>
            {channels.map((channel) => (
              <SelectItem key={channel.id} value={channel.id}>
                {channel.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.status} onValueChange={(v) => onChange({ status: v })}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>모든 상태</SelectItem>
            {(Object.keys(STATUS_LABEL) as ProjectStatus[]).map((status) => (
              <SelectItem key={status} value={status}>
                {STATUS_LABEL[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={value.format} onValueChange={(v) => onChange({ format: v })}>
          <SelectTrigger className="sm:w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>모든 포맷</SelectItem>
            {(Object.keys(VIDEO_FORMAT_LABEL) as VideoFormat[]).map((format) => (
              <SelectItem key={format} value={format}>
                {VIDEO_FORMAT_LABEL[format]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Select value={value.sort} onValueChange={(v) => onChange({ sort: v as ProjectSort })}>
        <SelectTrigger className="w-40">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORT_LABEL) as ProjectSort[]).map((sort) => (
            <SelectItem key={sort} value={sort}>
              {SORT_LABEL[sort]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export { ALL };
