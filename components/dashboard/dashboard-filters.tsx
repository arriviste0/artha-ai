"use client"

import { useState } from "react"
import { Calendar, Filter, RotateCcw, ChevronDown } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import type { DashboardFilterParams } from "@/hooks/use-dashboard"

const PRESETS = [
  { value: "this_month", label: "This Month" },
  { value: "last_month", label: "Last Month" },
  { value: "last_3_months", label: "Last 3 Months" },
  { value: "last_6_months", label: "Last 6 Months" },
  { value: "this_year", label: "This Year" },
  { value: "custom_month_year", label: "Month & Year" },
  { value: "custom_range", label: "Custom Dates" },
  { value: "all_time", label: "All Time" },
]

const MONTHS = [
  { value: 1, label: "January" },
  { value: 2, label: "February" },
  { value: 3, label: "March" },
  { value: 4, label: "April" },
  { value: 5, label: "May" },
  { value: 6, label: "June" },
  { value: 7, label: "July" },
  { value: 8, label: "August" },
  { value: 9, label: "September" },
  { value: 10, label: "October" },
  { value: 11, label: "November" },
  { value: 12, label: "December" },
]

const currentYear = new Date().getFullYear()
const YEARS = [currentYear - 2, currentYear - 1, currentYear, currentYear + 1]

interface DashboardFiltersProps {
  filters: DashboardFilterParams
  onFilterChange: (newFilters: DashboardFilterParams) => void
  activePeriodLabel?: string
}

export function DashboardFilters({
  filters,
  onFilterChange,
  activePeriodLabel,
}: DashboardFiltersProps) {
  const currentMonthNum = new Date().getMonth() + 1
  const selectedPeriod = filters.period || "this_month"

  const [selectedMonth, setSelectedMonth] = useState<number>(filters.month || currentMonthNum)
  const [selectedYear, setSelectedYear] = useState<number>(filters.year || currentYear)
  const [fromDate, setFromDate] = useState<string>(filters.from || "")
  const [toDate, setToDate] = useState<string>(filters.to || "")

  const handlePresetChange = (val: string) => {
    if (val === "custom_month_year") {
      onFilterChange({
        period: "custom_month_year",
        month: selectedMonth,
        year: selectedYear,
      })
    } else if (val === "custom_range") {
      onFilterChange({
        period: "custom_range",
        from: fromDate || undefined,
        to: toDate || undefined,
      })
    } else {
      onFilterChange({
        period: val as any,
      })
    }
  }

  const handleMonthChange = (monthStr: string) => {
    const m = parseInt(monthStr, 10)
    setSelectedMonth(m)
    onFilterChange({
      period: "custom_month_year",
      month: m,
      year: selectedYear,
    })
  }

  const handleYearChange = (yearStr: string) => {
    const y = parseInt(yearStr, 10)
    setSelectedYear(y)
    onFilterChange({
      period: "custom_month_year",
      month: selectedMonth,
      year: y,
    })
  }

  const handleDateApply = () => {
    if (fromDate && toDate) {
      onFilterChange({
        period: "custom_range",
        from: fromDate,
        to: toDate,
      })
    }
  }

  const handleReset = () => {
    setSelectedMonth(currentMonthNum)
    setSelectedYear(currentYear)
    setFromDate("")
    setToDate("")
    onFilterChange({ period: "this_month" })
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border bg-card/70 backdrop-blur-sm shadow-sm">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground mr-1">
          <Calendar className="h-4 w-4 text-primary" />
          <span className="font-semibold text-foreground">Time Period:</span>
        </div>

        {/* Preset Selector */}
        <Select value={selectedPeriod} onValueChange={handlePresetChange}>
          <SelectTrigger className="w-[145px] h-8 text-xs bg-background">
            <SelectValue placeholder="Select Period" />
          </SelectTrigger>
          <SelectContent>
            {PRESETS.map((p) => (
              <SelectItem key={p.value} value={p.value} className="text-xs">
                {p.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Month & Year Selectors (if custom_month_year chosen) */}
        {selectedPeriod === "custom_month_year" && (
          <div className="flex items-center gap-1.5 animate-in fade-in">
            <Select value={selectedMonth.toString()} onValueChange={handleMonthChange}>
              <SelectTrigger className="w-[115px] h-8 text-xs bg-background">
                <SelectValue placeholder="Month" />
              </SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m.value} value={m.value.toString()} className="text-xs">
                    {m.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedYear.toString()} onValueChange={handleYearChange}>
              <SelectTrigger className="w-[85px] h-8 text-xs bg-background">
                <SelectValue placeholder="Year" />
              </SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => (
                  <SelectItem key={y} value={y.toString()} className="text-xs">
                    {y}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        {/* Custom Date Range Picker (if custom_range chosen) */}
        {selectedPeriod === "custom_range" && (
          <div className="flex items-center gap-1.5 animate-in fade-in flex-wrap">
            <Input
              type="date"
              value={fromDate}
              onChange={(e) => setFromDate(e.target.value)}
              className="h-8 text-xs w-[130px] bg-background"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={toDate}
              onChange={(e) => setToDate(e.target.value)}
              className="h-8 text-xs w-[130px] bg-background"
            />
            <Button size="sm" variant="secondary" onClick={handleDateApply} className="h-8 text-xs px-2.5">
              Apply
            </Button>
          </div>
        )}

        {selectedPeriod !== "this_month" && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleReset}
            className="h-8 px-2 text-xs text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            Reset
          </Button>
        )}
      </div>

      {/* Active Range Pill */}
      {activePeriodLabel && (
        <Badge variant="secondary" className="text-xs px-2.5 py-1 font-medium bg-secondary/80 text-foreground w-fit">
          Viewing: {activePeriodLabel}
        </Badge>
      )}
    </div>
  )
}
