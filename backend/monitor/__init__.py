"""
monitor package

Initializes the Monitoring package for the Lavender Trinetra system
and exposes the public interfaces of its submodules for convenient
import by main.py and other consumers.
"""

from .cpu_monitor import (
    CPUMonitor,
    CPUReading,
    CPUFrequencyInfo,
    get_cpu_snapshot,
)
from .memory_monitor import (
    MemoryMonitor,
    MemoryReading,
    VirtualMemoryInfo,
    SwapMemoryInfo,
    get_memory_snapshot,
)
from .disk_monitor import (
    DiskMonitor,
    DiskReading,
    PartitionInfo,
    DiskIOInfo,
    get_disk_snapshot,
)
from .network_monitor import (
    NetworkMonitor,
    NetworkReading,
    NetworkIOInfo,
    InterfaceInfo,
    InterfaceAddress,
    get_network_snapshot,
)

__all__ = [
    # CPU
    "CPUMonitor",
    "CPUReading",
    "CPUFrequencyInfo",
    "get_cpu_snapshot",
    # Memory
    "MemoryMonitor",
    "MemoryReading",
    "VirtualMemoryInfo",
    "SwapMemoryInfo",
    "get_memory_snapshot",
    # Disk
    "DiskMonitor",
    "DiskReading",
    "PartitionInfo",
    "DiskIOInfo",
    "get_disk_snapshot",
    # Network
    "NetworkMonitor",
    "NetworkReading",
    "NetworkIOInfo",
    "InterfaceInfo",
    "InterfaceAddress",
    "get_network_snapshot",
]